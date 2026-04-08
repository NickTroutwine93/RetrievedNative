import { Message } from './Message';
import { Pet } from './Pet';

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return (value.toDate() as Date).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export class MessageThread {
  /** Matches the associated search document id */
  id: string = '';
  searchId: string = '';

  pet: Pet | null = null;

  ownerId: string = '';
  ownerName: string = '';

  searcherIds: string[] = [];
  searcherNames: string[] = [];

  lastMessage: Message | null = null;
  /** 0 = no unread messages */
  unreadCount: number = 0;
  /** ms timestamp used for sorting threads — most recent activity first */
  lastActivityMs: number = 0;

  /**
   * Build a MessageThread from a mapThreadRecord() result or any compatible
   * raw shape. Missing / invalid fields fall back to defaults.
   */
  static from(raw: any): MessageThread {
    const thread = new MessageThread();
    if (!raw) {
      return thread;
    }

    thread.id = String(raw.id ?? raw.searchId ?? '');
    thread.searchId = thread.id;

    thread.pet = raw.pet ? Pet.from(raw.pet) : null;

    thread.ownerId = String(raw.ownerId ?? raw.owner ?? raw.OwnerID ?? '');
    thread.ownerName = String(raw.ownerName ?? '');

    thread.searcherIds = Array.isArray(raw.searcherIds)
      ? raw.searcherIds.map(String)
      : Array.isArray(raw.Searchers)
      ? raw.Searchers.map(String)
      : [];

    thread.searcherNames = Array.isArray(raw.searcherNames)
      ? raw.searcherNames.map(String)
      : [];

    thread.lastMessage = raw.lastMessage ? Message.from(raw.lastMessage) : null;

    const parsedUnread = Number(raw.unreadCount ?? 0);
    thread.unreadCount =
      Number.isFinite(parsedUnread) && parsedUnread > 0 ? parsedUnread : 0;

    const parsedActivity = Number(raw.lastActivityMs ?? toMillis(raw.lastUpdated ?? raw.Date));
    thread.lastActivityMs = Number.isFinite(parsedActivity) ? parsedActivity : 0;

    return thread;
  }

  get hasUnread(): boolean {
    return this.unreadCount > 0;
  }

  get title(): string {
    return this.pet?.Name
      ? `Search: ${this.pet.Name}`
      : `Search ${this.searchId || ''}`.trim();
  }
}
