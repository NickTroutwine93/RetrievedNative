import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationCenterItemType =
  | 'nearby-search'
  | 'search-message'
  | 'search-sighting'
  | 'nearby-sighting';

export type NotificationCenterItem = {
  id: string;
  type: NotificationCenterItemType;
  title: string;
  body: string;
  searchId?: string;
  sightingId?: string;
  createdAtMs: number;
};

type NotificationCenterListener = (items: NotificationCenterItem[]) => void;

const MAX_ITEMS = 100;
const STORAGE_KEY = 'retrievednative.notificationCenter.v1';

let items: NotificationCenterItem[] = [];
const listeners = new Set<NotificationCenterListener>();
let hasHydrated = false;
let hydratePromise: Promise<void> | null = null;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

function publish() {
  const snapshot = getNotificationCenterItems();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener errors so one bad consumer does not break updates.
    }
  });
}

function normalizeStoredItems(raw: any): NotificationCenterItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || ''),
      type: String(entry.type || 'nearby-search') as NotificationCenterItemType,
      title: String(entry.title || ''),
      body: String(entry.body || ''),
      searchId: entry.searchId ? String(entry.searchId) : undefined,
      sightingId: entry.sightingId ? String(entry.sightingId) : undefined,
      createdAtMs: Number(entry.createdAtMs || 0),
    }))
    .filter((entry) => entry.id && entry.title && entry.body && Number.isFinite(entry.createdAtMs))
    .slice(0, MAX_ITEMS);
}

function schedulePersist() {
  if (!hasHydrated) {
    return;
  }

  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }

  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {
      // Ignore storage write errors to avoid crashing notifications flow.
    });
  }, 120);
}

export async function initNotificationCenter() {
  if (hasHydrated) {
    return;
  }

  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (!rawValue) {
        items = [];
        return;
      }

      const parsed = JSON.parse(rawValue);
      items = normalizeStoredItems(parsed);
    } catch {
      items = [];
    } finally {
      hasHydrated = true;
      hydratePromise = null;
      publish();
    }
  })();

  return hydratePromise;
}

export function getNotificationCenterItems(): NotificationCenterItem[] {
  return [...items].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function addNotificationCenterItem(item: Omit<NotificationCenterItem, 'id' | 'createdAtMs'>) {
  const nextItem: NotificationCenterItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAtMs: Date.now(),
  };

  items = [nextItem, ...items].slice(0, MAX_ITEMS);
  schedulePersist();
  publish();
  return nextItem;
}

export function clearNotificationCenterItems() {
  items = [];
  schedulePersist();
  publish();
}

export function subscribeNotificationCenter(listener: NotificationCenterListener): () => void {
  void initNotificationCenter();
  listeners.add(listener);
  listener(getNotificationCenterItems());
  return () => {
    listeners.delete(listener);
  };
}
