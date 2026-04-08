import { Pet } from './Pet';
import { SearcherEntry } from './SearcherEntry';
import { Sighting } from './Sighting';

import type { Coordinate } from './UserAccount';

export class Search {
  /** Firestore document id */
  id: string = '';

  // Pet reference
  PetID: string = '';
  pet: Pet | null = null;

  // Ownership
  OwnerID: string = '';
  /** Alias used by hydrated records */
  owner: string = '';
  ownerName: string = '';

  // Location — viewer-safe (may be obfuscated for non-owners)
  Location: Coordinate | null = null;
  /** Alias used by hydrated records */
  location: Coordinate | null = null;
  locationIsObfuscated: boolean = false;

  // Dates — raw Firestore timestamps kept as `any` to avoid Firestore coupling
  Date: any = null;
  /** Alias used by hydrated records */
  date: any = null;
  created: any = null;
  lastUpdated: any = null;

  /** Search radius in miles */
  Radius: number = 5;

  /** 1 = active, 0 = ended */
  Status: number = 1;
  /** Alias used by hydrated records */
  status: number = 1;

  /** 1 = found, 0 = not found / still open */
  Successfull: number = 0;

  Sightings: Sighting[] = [];
  /** Raw serialised searcher strings from Firestore */
  Searchers: SearcherEntry[] = [];
  /** Normalised structured searcher entries */
  searcherEntries: SearcherEntry[] = [];
  /** Active searcher user ids */
  searchers: string[] = [];
  searcherNames: string[] = [];

  Info: string = '';
  Tipped: string[] = [];

  // Messaging summary fields
  lastMessageAt: any = null;
  lastMessageText: string = '';
  lastMessageSenderID: string = '';
  lastMessageSenderName: string = '';
  /** Map of userId → last-read timestamp */
  MessageReadAt: Record<string, any> = {};

  /**
   * Build a Search from a hydrated record returned by hydrateSearchRecord()
   * or getSearchById() / getUserSearches(). Raw Firestore documents work too
   * but Pet / Sighting sub-objects will be empty; prefer the hydrated form.
   */
  static from(raw: any): Search {
    const search = new Search();
    if (!raw) {
      return search;
    }

    search.id = raw.id ?? '';
    search.PetID = String(raw.PetID ?? raw.petID ?? '');
    search.pet = raw.pet ? Pet.from(raw.pet) : null;

    search.OwnerID = String(raw.OwnerID ?? raw.owner ?? '');
    search.owner = search.OwnerID;
    search.ownerName = String(raw.ownerName ?? '');

    const rawLoc = raw.Location ?? raw.location;
    const safeLocation: Coordinate | null =
      rawLoc &&
      Number.isFinite(rawLoc.latitude) &&
      Number.isFinite(rawLoc.longitude)
        ? { latitude: rawLoc.latitude, longitude: rawLoc.longitude }
        : null;
    search.Location = safeLocation;
    search.location = safeLocation;
    search.locationIsObfuscated = Boolean(
      raw.locationIsObfuscated ?? raw.LocationIsObfuscated ?? false
    );

    const dateValue = raw.Date ?? raw.date ?? null;
    search.Date = dateValue;
    search.date = dateValue;
    search.created = raw.created ?? null;
    search.lastUpdated = raw.lastUpdated ?? null;

    const parsedRadius = Number(raw.Radius ?? raw.radius ?? 5);
    search.Radius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 5;

    const parsedStatus = Number(raw.Status ?? raw.status ?? 1);
    search.Status = parsedStatus === 0 ? 0 : 1;
    search.status = search.Status;

    search.Successfull = Number(raw.Successfull ?? raw.Successful ?? 0) === 1 ? 1 : 0;

    // Sightings — already mapped by hydrateSearchRecord, or raw Firestore array
    const rawSightings = Array.isArray(raw.Sightings)
      ? raw.Sightings
      : Array.isArray(raw.sightings)
      ? raw.sightings
      : [];
    search.Sightings = (rawSightings
      .map((s: any, i: number) => Sighting.from(s, i))
      .filter((s: Sighting | null): s is Sighting => s !== null) as Sighting[])
      .sort((a: Sighting, b: Sighting) => b.createdAtMs - a.createdAtMs);

    // Searcher entries
    const rawSearcherEntries = Array.isArray(raw.searcherEntries)
      ? raw.searcherEntries
      : Array.isArray(raw.Searchers)
      ? raw.Searchers
      : Array.isArray(raw.searchers)
      ? raw.searchers
      : [];
    search.searcherEntries = (rawSearcherEntries
      .map((e: any) => SearcherEntry.from(e))
      .filter((e: SearcherEntry | null): e is SearcherEntry => e !== null) as SearcherEntry[]);

    search.searchers = Array.isArray(raw.searchers)
      ? raw.searchers.filter((id: any) => typeof id === 'string')
      : search.searcherEntries
          .filter((e) => e.isActive)
          .map((e) => e.searcherId);

    search.searcherNames = Array.isArray(raw.searcherNames)
      ? raw.searcherNames.map(String)
      : [];

    search.Info = String(raw.Info ?? raw.info ?? '');
    search.Tipped = Array.isArray(raw.Tipped) ? raw.Tipped.map(String) : [];

    search.lastMessageAt = raw.lastMessageAt ?? null;
    search.lastMessageText = String(raw.lastMessageText ?? '');
    search.lastMessageSenderID = String(raw.lastMessageSenderID ?? '');
    search.lastMessageSenderName = String(raw.lastMessageSenderName ?? '');
    search.MessageReadAt =
      raw.MessageReadAt && typeof raw.MessageReadAt === 'object' ? raw.MessageReadAt : {};

    return search;
  }

  get isActive(): boolean {
    return this.Status === 1;
  }

  get wasFound(): boolean {
    return this.Successfull === 1;
  }

  get participantCount(): number {
    return this.searchers.length;
  }
}
