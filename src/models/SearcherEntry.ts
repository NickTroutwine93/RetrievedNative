export class SearcherEntry {
  searcherId: string = '';
  /** 1 = active participant, 0 = withdrew */
  status: number = 1;

  /**
   * Build a SearcherEntry from the shapes produced by parseSearcherEntry()
   * or any raw Firestore searcher object / legacy plain-string user id.
   */
  static from(raw: any): SearcherEntry | null {
    const entry = new SearcherEntry();

    if (!raw) {
      return null;
    }

    // Legacy: plain user-id string
    if (typeof raw === 'string') {
      if (!raw) {
        return null;
      }
      entry.searcherId = raw;
      entry.status = 1;
      return entry;
    }

    if (typeof raw === 'object') {
      const searcherId =
        raw.SearcherID ??
        raw.searcherId ??
        raw.SearchersID ??
        raw.searchersID ??
        raw.id ??
        '';
      if (!searcherId) {
        return null;
      }

      entry.searcherId = String(searcherId);
      const parsedStatus = Number(raw.Status ?? raw.status ?? 1);
      entry.status = parsedStatus === 0 ? 0 : 1;
      return entry;
    }

    return null;
  }

  get isActive(): boolean {
    return this.status === 1;
  }
}
