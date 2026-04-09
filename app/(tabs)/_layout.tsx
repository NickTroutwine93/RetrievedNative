import { Tabs } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GestureDetector } from 'react-native-gesture-handler';
import { View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { AppHeader } from '@/components/app-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { gesture } = useSwipeNavigation();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }}>
          <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
          headerShown: true,
          header: () => <AppHeader />,
          headerShadowVisible: false,
          tabBarButton: HapticTab,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].surface,
            borderTopColor: Colors[colorScheme ?? 'light'].border,
            borderTopWidth: 1,
            height: 74,
            paddingTop: 8,
            paddingBottom: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700',
          },
        }}
        screenListeners={{
          tabPress: ({ target }) => {
            // Enable smooth transitions on tab press
          },
        }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="searches"
        options={{
          title: 'Your Searches',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
    </Tabs>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
