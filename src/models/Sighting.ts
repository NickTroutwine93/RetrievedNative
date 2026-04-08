function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return (value.toDate() as Date).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export class Sighting {
  id: string = '';
  latitude: number = 0;
  longitude: number = 0;
  /** Confidence rating 1–5 */
  confidence: number = 0;
  details: string = '';
  reporterId: string = '';
  reporterName: string = 'Searcher';
  /** Raw Firestore timestamp — may be a Timestamp, Date, or null */
  createdAt: any = null;
  /** Pre-computed milliseconds for sorting */
  createdAtMs: number = 0;

  /**
   * Build a Sighting from:
   * - a raw Firestore sighting object (stored inside searches.Sightings[])
   * - an already-mapped record from mapSightingRecord()
   *
   * Returns null when coordinates are absent or invalid.
   */
  static from(raw: any, index = 0): Sighting | null {
    if (!raw) {
      return null;
    }

    // Resolve coordinates — raw Firestore uses Location.latitude, mapped records
    // use top-level latitude/longitude.
    const location = raw.Location ?? raw.location;
    const latitude = raw.latitude ?? location?.latitude;
    const longitude = raw.longitude ?? location?.longitude;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const sighting = new Sighting();
    const createdAt = raw.createdAt ?? raw.CreatedAt ?? null;

    sighting.id =
      raw.id ||
      `sighting-${index}-${toMillis(createdAt)}`;
    sighting.latitude = latitude;
    sighting.longitude = longitude;
    sighting.confidence = Number(raw.Confidence ?? raw.confidence ?? 0);
    sighting.details = String(raw.Details ?? raw.details ?? '');
    sighting.reporterId = String(raw.ReporterID ?? raw.reporterId ?? '');
    sighting.reporterName = String(raw.ReporterName ?? raw.reporterName ?? 'Searcher');
    sighting.createdAt = createdAt;
    sighting.createdAtMs = toMillis(createdAt);

    return sighting;
  }

  get confidenceLabel(): string {
    const labels: Record<number, string> = {
      1: 'Very Low',
      2: 'Low',
      3: 'Moderate',
      4: 'High',
      5: 'Very High',
    };
    return labels[this.confidence] ?? 'Unknown';
  }
}
