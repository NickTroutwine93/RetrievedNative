function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return (value.toDate() as Date).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export class Message {
  id: string = '';
  SearchID: string = '';

  // Both PascalCase (Firestore) and camelCase (mapped) aliases present to
  // match what mapMessageRecord() and sendSearchMessage() return.
  SenderID: string = '';
  senderId: string = '';
  SenderName: string = '';
  senderName: string = '';
  Text: string = '';
  text: string = '';

  /** Raw Firestore timestamp — may be a Timestamp, Date, or null */
  createdAt: any = null;
  /** Pre-computed milliseconds for sorting / display */
  createdAtMs: number = 0;

  /**
   * Build a Message from a Firestore document, a mapMessageRecord() result,
   * or a thread-summary message object. Missing fields use defaults.
   */
  static from(raw: any): Message {
    const message = new Message();
    if (!raw) {
      return message;
    }

    message.id = String(raw.id ?? '');
    message.SearchID = String(raw.SearchID ?? raw.searchId ?? '');

    const senderId = String(raw.SenderID ?? raw.senderId ?? '');
    message.SenderID = senderId;
    message.senderId = senderId;

    const senderName = String(raw.SenderName ?? raw.senderName ?? '');
    message.SenderName = senderName;
    message.senderName = senderName;

    const text = String(raw.Text ?? raw.text ?? '');
    message.Text = text;
    message.text = text;

    message.createdAt = raw.createdAt ?? null;
    message.createdAtMs = toMillis(raw.createdAt ?? raw.createdAtMs);

    return message;
  }

  get formattedTime(): string {
    if (!this.createdAtMs) return '';
    return new Date(this.createdAtMs).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
