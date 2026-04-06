import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, PanResponder, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { IconSymbol } from './ui/icon-symbol';
import { ThemedText } from './themed-text';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Props = {
  center: Coordinate;
  radiusMiles: number;
  apiKey: string;
  zoom?: number;
  maxZoom?: number;
  styleId?: string;
  containerStyle?: ViewStyle;
  radiusFillColor?: string;
  radiusBorderColor?: string;
  secondaryRadiusMiles?: number;
  secondaryRadiusFillColor?: string;
  secondaryRadiusBorderColor?: string;
  secondaryRadiusVisualScale?: number;
  centerMarker?: 'dot' | 'house' | 'none';
  centerMarkerColor?: string;
  zones?: Array<{
    id?: string;
    latitude: number;
    longitude: number;
    radiusMiles: number;
    fillColor?: string;
    borderColor?: string;
    visualScale?: number;
  }>;
  onZoomChange?: (zoom: number) => void;
  markers?: Array<{
    latitude: number;
    longitude: number;
    label: string;
    color?: string;
    textColor?: string;
  }>;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const MAX_LATITUDE = 85.05112878;

function milesToMeters(miles: number) {
  return miles * 1609.344;
}

function metersPerPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}

function zoomForMetersPerPixel(latitude: number, metersPerPixelTarget: number) {
  const safeTarget = Math.max(metersPerPixelTarget, 0.0001);
  const rawZoom = Math.log2((156543.03392 * Math.cos((latitude * Math.PI) / 180)) / safeTarget);
  if (!Number.isFinite(rawZoom)) {
    return MIN_ZOOM;
  }

  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));
}

function longitudeToTileX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * Math.pow(2, zoom);
}

function latitudeToTileY(latitude: number, zoom: number) {
  const safeLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const latRad = (safeLat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function tileXToLongitude(tileX: number, zoom: number) {
  return (tileX / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLatitude(tileY: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * tileY) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function wrapTileX(x: number, zoom: number) {
  const max = Math.pow(2, zoom);
  return ((x % max) + max) % max;
}

function isValidCenter(center: Coordinate) {
  return Number.isFinite(center.latitude) && Number.isFinite(center.longitude);
}

export function MapTilerTileMap({
  center,
  radiusMiles,
  apiKey,
  zoom = 12,
  maxZoom = MAX_ZOOM,
  styleId = 'streets-v4',
  containerStyle,
  radiusFillColor = 'rgba(0, 102, 255, 0.20)',
  radiusBorderColor = 'rgba(0, 102, 255, 0.75)',
  secondaryRadiusMiles,
  secondaryRadiusFillColor = 'rgba(0, 70, 140, 0.28)',
  secondaryRadiusBorderColor = 'rgba(0, 70, 140, 0.70)',
  secondaryRadiusVisualScale,
  centerMarker = 'dot',
  centerMarkerColor = '#0a5df0',
  zones = [],
  onZoomChange,
  markers = [],
}: Props) {
  const safeMaxZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(maxZoom) || MAX_ZOOM));
  const containerRef = useRef<any>(null);
  const [layout, setLayout] = useState({ width: 320, height: 240 });
  const [geoCenter, setGeoCenter] = useState(center);
  const [viewCenter, setViewCenter] = useState(center);
  const [zoomLevel, setZoomLevel] = useState(zoom);
  const [hasUserZoomed, setHasUserZoomed] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [pinchScale, setPinchScale] = useState(1);
  const gestureModeRef = useRef<'none' | 'pan' | 'pinch'>('none');
  const pinchStartDistanceRef = useRef(0);
  const pinchStartZoomRef = useRef(zoom);
  const effectiveZoomRef = useRef(zoom);

  useEffect(() => {
    setGeoCenter(center);
    setViewCenter(center);
    setHasUserZoomed(false);
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    setZoomLevel(Math.max(MIN_ZOOM, Math.min(safeMaxZoom, zoom)));
    setHasUserZoomed(false);
  }, [safeMaxZoom, zoom]);

  const effectiveZoom = useMemo(() => {
    if (!isValidCenter(viewCenter)) {
      return Math.max(MIN_ZOOM, Math.min(safeMaxZoom, zoomLevel));
    }

    const minDimension = Math.max(120, Math.min(layout.width, layout.height));
    const fitTargetRadiusPx = Math.max(32, minDimension * 0.35);
    const radiusMeters = milesToMeters(Math.max(0.1, radiusMiles));
    const fitMetersPerPixel = radiusMeters / fitTargetRadiusPx;
    const fitZoom = zoomForMetersPerPixel(viewCenter.latitude, fitMetersPerPixel);

    const nextZoom = hasUserZoomed ? zoomLevel : Math.min(zoomLevel, fitZoom);
    return Math.max(MIN_ZOOM, Math.min(safeMaxZoom, nextZoom));
  }, [hasUserZoomed, layout.height, layout.width, radiusMiles, safeMaxZoom, viewCenter, zoomLevel]);

  const tileZoom = useMemo(() => {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(effectiveZoom)));
  }, [effectiveZoom]);

  useEffect(() => {
    effectiveZoomRef.current = effectiveZoom;
  }, [effectiveZoom]);

  const radiusPixelSize = useMemo(() => {
    if (!isValidCenter(geoCenter)) {
      return 0;
    }

    const radiusMeters = milesToMeters(radiusMiles);
    const mpp = metersPerPixel(geoCenter.latitude, effectiveZoom);
    const radiusPx = radiusMeters / Math.max(mpp, 0.0001);
    const maxVisibleRadiusPx = Math.max(32, Math.min(layout.width, layout.height) * 3);
    const clamped = Math.min(radiusPx, maxVisibleRadiusPx);
    return Math.max(8, clamped);
  }, [effectiveZoom, geoCenter, layout.height, layout.width, radiusMiles]);

  const secondaryRadiusPixelSize = useMemo(() => {
    if (!isValidCenter(geoCenter) || !Number.isFinite(secondaryRadiusMiles) || Number(secondaryRadiusMiles) <= 0) {
      return 0;
    }

    const radiusMeters = milesToMeters(Number(secondaryRadiusMiles));
    const mpp = metersPerPixel(geoCenter.latitude, effectiveZoom);
    const radiusPx = radiusMeters / Math.max(mpp, 0.0001);
    const maxVisibleRadiusPx = Math.max(32, Math.min(layout.width, layout.height) * 3);
    const clamped = Math.min(radiusPx, maxVisibleRadiusPx);
    return Math.max(8, clamped);
  }, [effectiveZoom, geoCenter, layout.height, layout.width, secondaryRadiusMiles]);

  const clampedSecondaryRadiusVisualScale = useMemo(() => {
    if (!Number.isFinite(secondaryRadiusVisualScale as number)) {
      return 1;
    }

    return Math.max(0.35, Math.min(1, Number(secondaryRadiusVisualScale)));
  }, [secondaryRadiusVisualScale]);

  const overlayCenter = useMemo(() => {
    if (!isValidCenter(geoCenter) || !isValidCenter(viewCenter)) {
      return { x: layout.width / 2, y: layout.height / 2 };
    }

    const geoTileX = longitudeToTileX(geoCenter.longitude, tileZoom);
    const geoTileY = latitudeToTileY(geoCenter.latitude, tileZoom);
    const viewTileX = longitudeToTileX(viewCenter.longitude, tileZoom);
    const viewTileY = latitudeToTileY(viewCenter.latitude, tileZoom);

    return {
      x: layout.width / 2 + (geoTileX - viewTileX) * TILE_SIZE + panOffset.x,
      y: layout.height / 2 + (geoTileY - viewTileY) * TILE_SIZE + panOffset.y,
    };
  }, [geoCenter, layout.height, layout.width, panOffset.x, panOffset.y, tileZoom, viewCenter]);

  const tiles = useMemo(() => {
    if (!apiKey || !isValidCenter(viewCenter)) {
      return [] as Array<{ key: string; left: number; top: number; uri: string }>;
    }

    const tileXFloat = longitudeToTileX(viewCenter.longitude, tileZoom);
    const tileYFloat = latitudeToTileY(viewCenter.latitude, tileZoom);
    const centerTileX = Math.floor(tileXFloat);
    const centerTileY = Math.floor(tileYFloat);
    const offsetX = (tileXFloat - centerTileX) * TILE_SIZE;
    const offsetY = (tileYFloat - centerTileY) * TILE_SIZE;

    const horizontalCount = Math.ceil(layout.width / TILE_SIZE) + 4;
    const verticalCount = Math.ceil(layout.height / TILE_SIZE) + 4;
    const startDx = -Math.floor(horizontalCount / 2);
    const startDy = -Math.floor(verticalCount / 2);
    const maxTile = Math.pow(2, tileZoom) - 1;

    const nextTiles: Array<{ key: string; left: number; top: number; uri: string }> = [];

    for (let col = 0; col < horizontalCount; col += 1) {
      for (let row = 0; row < verticalCount; row += 1) {
        const dx = startDx + col;
        const dy = startDy + row;
        const sourceTileX = centerTileX + dx;
        const sourceTileY = centerTileY + dy;

        if (sourceTileY < 0 || sourceTileY > maxTile) {
          continue;
        }

        const wrappedX = wrapTileX(sourceTileX, tileZoom);
        const left = layout.width / 2 - offsetX + dx * TILE_SIZE + panOffset.x;
        const top = layout.height / 2 - offsetY + dy * TILE_SIZE + panOffset.y;

        nextTiles.push({
          key: `${tileZoom}-${wrappedX}-${sourceTileY}-${col}-${row}`,
          left,
          top,
          uri: `https://api.maptiler.com/maps/${styleId}/${tileZoom}/${wrappedX}/${sourceTileY}.png?key=${apiKey}`,
        });
      }
    }

    return nextTiles;
  }, [apiKey, layout.height, layout.width, panOffset.x, panOffset.y, styleId, tileZoom, viewCenter]);

  const markerPositions = useMemo(() => {
    if (!isValidCenter(viewCenter) || !Array.isArray(markers) || markers.length === 0) {
      return [] as Array<{ key: string; x: number; y: number; label: string; color: string; textColor: string }>;
    }

    const worldTiles = Math.pow(2, tileZoom);
    const viewTileX = longitudeToTileX(viewCenter.longitude, tileZoom);
    const viewTileY = latitudeToTileY(viewCenter.latitude, tileZoom);

    return markers
      .filter((marker) => Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude) && marker.label)
      .map((marker, index) => {
        const markerTileX = longitudeToTileX(marker.longitude, tileZoom);
        const markerTileY = latitudeToTileY(marker.latitude, tileZoom);

        let deltaTileX = markerTileX - viewTileX;
        if (deltaTileX > worldTiles / 2) {
          deltaTileX -= worldTiles;
        } else if (deltaTileX < -worldTiles / 2) {
          deltaTileX += worldTiles;
        }

        return {
          key: `marker-${index}-${marker.label}`,
          x: layout.width / 2 + deltaTileX * TILE_SIZE + panOffset.x,
          y: layout.height / 2 + (markerTileY - viewTileY) * TILE_SIZE + panOffset.y,
          label: marker.label,
          color: marker.color || '#0a5df0',
          textColor: marker.textColor || '#ffffff',
        };
      });
  }, [layout.height, layout.width, markers, panOffset.x, panOffset.y, tileZoom, viewCenter]);

  const zoneOverlays = useMemo(() => {
    if (!isValidCenter(viewCenter) || !Array.isArray(zones) || zones.length === 0) {
      return [] as Array<{ key: string; x: number; y: number; radiusPx: number; fillColor: string; borderColor: string }>;
    }

    const worldTiles = Math.pow(2, tileZoom);
    const viewTileX = longitudeToTileX(viewCenter.longitude, tileZoom);
    const viewTileY = latitudeToTileY(viewCenter.latitude, tileZoom);

    return zones
      .filter(
        (zone) =>
          Number.isFinite(zone.latitude) &&
          Number.isFinite(zone.longitude) &&
          Number.isFinite(zone.radiusMiles) &&
          Number(zone.radiusMiles) > 0
      )
      .map((zone, index) => {
        const zoneTileX = longitudeToTileX(zone.longitude, tileZoom);
        const zoneTileY = latitudeToTileY(zone.latitude, tileZoom);

        let deltaTileX = zoneTileX - viewTileX;
        if (deltaTileX > worldTiles / 2) {
          deltaTileX -= worldTiles;
        } else if (deltaTileX < -worldTiles / 2) {
          deltaTileX += worldTiles;
        }

        const mpp = metersPerPixel(zone.latitude, effectiveZoom);
        const baseRadiusPx = milesToMeters(Number(zone.radiusMiles)) / Math.max(mpp, 0.0001);
        const maxVisibleRadiusPx = Math.max(32, Math.min(layout.width, layout.height) * 3);
        const clampedBaseRadiusPx = Math.max(8, Math.min(baseRadiusPx, maxVisibleRadiusPx));
        const clampedScale = Number.isFinite(zone.visualScale) ? Math.max(0.35, Math.min(1, Number(zone.visualScale))) : 1;

        return {
          key: zone.id || `zone-${index}`,
          x: layout.width / 2 + deltaTileX * TILE_SIZE + panOffset.x,
          y: layout.height / 2 + (zoneTileY - viewTileY) * TILE_SIZE + panOffset.y,
          radiusPx: clampedBaseRadiusPx * clampedScale,
          fillColor: zone.fillColor || 'rgba(0, 70, 140, 0.26)',
          borderColor: zone.borderColor || 'rgba(0, 70, 140, 0.70)',
        };
      });
  }, [effectiveZoom, layout.height, layout.width, panOffset.x, panOffset.y, tileZoom, viewCenter, zones]);

  useEffect(() => {
    if (typeof onZoomChange === 'function') {
      onZoomChange(effectiveZoom);
    }
  }, [effectiveZoom, onZoomChange]);

  const calculateTouchDistance = (touches: Array<{ pageX: number; pageY: number }>) => {
    if (touches.length < 2) {
      return 0;
    }

    const a = touches[0];
    const b = touches[1];
    const dx = b.pageX - a.pageX;
    const dy = b.pageY - a.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const commitPanToCenter = (dx: number, dy: number) => {
    if (!isValidCenter(viewCenter)) {
      return;
    }

    const currentTileX = longitudeToTileX(viewCenter.longitude, tileZoom);
    const currentTileY = latitudeToTileY(viewCenter.latitude, tileZoom);
    const nextTileX = currentTileX - dx / TILE_SIZE;
    const nextTileY = currentTileY - dy / TILE_SIZE;
    const maxTileIndex = Math.pow(2, tileZoom) - 1;
    const clampedTileY = Math.max(0, Math.min(maxTileIndex, nextTileY));

    setViewCenter({
      latitude: Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, tileYToLatitude(clampedTileY, tileZoom))),
      longitude: tileXToLongitude(nextTileX, tileZoom),
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            gestureModeRef.current = 'pinch';
            pinchStartDistanceRef.current = calculateTouchDistance(touches as Array<{ pageX: number; pageY: number }>);
            pinchStartZoomRef.current = effectiveZoomRef.current;
            setPanOffset({ x: 0, y: 0 });
          } else {
            gestureModeRef.current = 'pan';
          }
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = calculateTouchDistance(touches as Array<{ pageX: number; pageY: number }>);

            if (gestureModeRef.current !== 'pinch') {
              gestureModeRef.current = 'pinch';
              pinchStartDistanceRef.current = distance;
              pinchStartZoomRef.current = effectiveZoomRef.current;
              setPanOffset({ x: 0, y: 0 });
              return;
            }

            if (pinchStartDistanceRef.current > 0) {
              const scale = Math.max(0.5, Math.min(3, distance / pinchStartDistanceRef.current));
              setPinchScale(scale);
            }
            return;
          }

          if (gestureModeRef.current !== 'pinch') {
            gestureModeRef.current = 'pan';
            setPanOffset({ x: gestureState.dx, y: gestureState.dy });
          }
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureModeRef.current === 'pinch') {
            const deltaZoom = Math.log2(Math.max(0.5, Math.min(3, pinchScale)));
            const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoomRef.current + deltaZoom));
            setHasUserZoomed(true);
            setZoomLevel(nextZoom);
          } else if (gestureModeRef.current === 'pan') {
            commitPanToCenter(gestureState.dx, gestureState.dy);
          }

          gestureModeRef.current = 'none';
          pinchStartDistanceRef.current = 0;
          setPanOffset({ x: 0, y: 0 });
          setPinchScale(1);
        },
        onPanResponderTerminate: () => {
          gestureModeRef.current = 'none';
          pinchStartDistanceRef.current = 0;
          setPanOffset({ x: 0, y: 0 });
          setPinchScale(1);
        },
      }),
    [pinchScale, tileZoom, viewCenter]
  );

  const wheelHandlers = useMemo(() => {
    if (Platform.OS !== 'web') {
      return {};
    }

    return {
      onWheelCapture: (event: any) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        const deltaY = event?.nativeEvent?.deltaY ?? event?.deltaY ?? 0;
        if (!Number.isFinite(deltaY) || deltaY === 0) {
          return;
        }

        const step = deltaY < 0 ? 0.35 : -0.35;
        setHasUserZoomed(true);
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, effectiveZoomRef.current + step));
        setZoomLevel(nextZoom);
      },
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof node.addEventListener !== 'function') {
      return;
    }

    const onNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const deltaY = event.deltaY;
      if (!Number.isFinite(deltaY) || deltaY === 0) {
        return;
      }

      const step = deltaY < 0 ? 0.35 : -0.35;
      setHasUserZoomed(true);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, effectiveZoomRef.current + step));
      setZoomLevel(nextZoom);
    };

    node.addEventListener('wheel', onNativeWheel, { passive: false });

    return () => {
      node.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setLayout({ width, height });
    }
  };

  return (
    <View
      ref={containerRef}
      style={[styles.container, containerStyle]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
      {...(wheelHandlers as any)}>
      <View style={[styles.tilesLayer, { transform: [{ scale: pinchScale }] }]}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            style={[styles.tile, { left: tile.left, top: tile.top }]}
            resizeMode="cover"
          />
        ))}
      </View>

      <View
        style={[
          styles.radiusCircle,
          {
            width: radiusPixelSize * 2 * pinchScale,
            height: radiusPixelSize * 2 * pinchScale,
            borderRadius: radiusPixelSize * pinchScale,
            left: overlayCenter.x,
            top: overlayCenter.y,
            borderColor: radiusBorderColor,
            backgroundColor: radiusFillColor,
            transform: [{ translateX: -radiusPixelSize * pinchScale }, { translateY: -radiusPixelSize * pinchScale }],
          },
        ]}
      />

      {secondaryRadiusPixelSize > 0 ? (
        <View
          style={[
            styles.radiusCircle,
            {
              width: secondaryRadiusPixelSize * 2 * pinchScale * clampedSecondaryRadiusVisualScale,
              height: secondaryRadiusPixelSize * 2 * pinchScale * clampedSecondaryRadiusVisualScale,
              borderRadius: secondaryRadiusPixelSize * pinchScale * clampedSecondaryRadiusVisualScale,
              left: overlayCenter.x,
              top: overlayCenter.y,
              borderColor: secondaryRadiusBorderColor,
              backgroundColor: secondaryRadiusFillColor,
              transform: [
                { translateX: -secondaryRadiusPixelSize * pinchScale * clampedSecondaryRadiusVisualScale },
                { translateY: -secondaryRadiusPixelSize * pinchScale * clampedSecondaryRadiusVisualScale },
              ],
            },
          ]}
        />
      ) : null}

      {zoneOverlays.map((zone) => (
        <View
          key={zone.key}
          pointerEvents="none"
          style={[
            styles.radiusCircle,
            {
              width: zone.radiusPx * 2 * pinchScale,
              height: zone.radiusPx * 2 * pinchScale,
              borderRadius: zone.radiusPx * pinchScale,
              left: zone.x,
              top: zone.y,
              borderColor: zone.borderColor,
              backgroundColor: zone.fillColor,
              transform: [{ translateX: -zone.radiusPx * pinchScale }, { translateY: -zone.radiusPx * pinchScale }],
            },
          ]}
        />
      ))}

      {centerMarker === 'house' ? (
        <View style={[styles.centerIconContainer, { left: overlayCenter.x, top: overlayCenter.y }]}>
          <IconSymbol size={18} name="house.fill" color={centerMarkerColor} />
        </View>
      ) : centerMarker === 'dot' ? (
        <View style={[styles.centerDot, { left: overlayCenter.x, top: overlayCenter.y, backgroundColor: centerMarkerColor }]} />
      ) : null}

      {markerPositions.map((marker) => (
        <View key={marker.key} style={[styles.numberMarker, { left: marker.x, top: marker.y, backgroundColor: marker.color }]}>
          <ThemedText style={[styles.numberMarkerText, { color: marker.textColor }]}>{marker.label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#dfeaf2',
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tilesLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  radiusCircle: {
    position: 'absolute',
    borderWidth: 2,
  },
  centerDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    marginTop: -6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  centerIconContainer: {
    position: 'absolute',
    marginLeft: -9,
    marginTop: -9,
  },
  numberMarker: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    backgroundColor: '#0a5df0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  numberMarkerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
