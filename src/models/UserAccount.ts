export const UserRole = Object.freeze({
  USER: 1,
  SHELTER: 2,
  ADMIN: 3,
} as const);

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export class UserAccount {
  /** Firestore document id */
  id: string = '';
  Email: string = '';
  FirstName: string = '';
  LastName: string = '';
  Role: UserRoleValue = UserRole.USER;
  Radius: number = 5;
  Location: Coordinate | null = null;
  PetID: string[] = [];
  ActiveSearches: string[] = [];
  SearchHistory: string[] = [];
  YourSearches: string[] = [];
  AuthenticationAgent: string = 'Password';

  // camelCase aliases returned by getUserData — kept for backward compatibility
  firstName: string = '';
  radius: number = 5;
  location: Coordinate | null = null;
  role: UserRoleValue = UserRole.USER;

  /**
   * Build a UserAccount from a raw Firestore document or a value already
   * returned by getUserData(). Missing or invalid fields fall back to defaults.
   */
  static from(raw: any): UserAccount {
    const account = new UserAccount();
    if (!raw) {
      return account;
    }

    account.id = raw.id ?? '';
    account.Email = String(raw.Email ?? raw.email ?? '');
    account.FirstName = String(raw.FirstName ?? raw.firstName ?? '');
    account.LastName = String(raw.LastName ?? raw.lastName ?? '');

    const parsedRole = Number(raw.Role ?? raw.role ?? UserRole.USER);
    account.Role =
      parsedRole === UserRole.SHELTER || parsedRole === UserRole.ADMIN
        ? (parsedRole as UserRoleValue)
        : UserRole.USER;

    const parsedRadius = Number(raw.Radius ?? raw.radius ?? 5);
    account.Radius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 5;

    const rawLoc = raw.Location ?? raw.location;
    account.Location =
      rawLoc &&
      Number.isFinite(rawLoc.latitude) &&
      Number.isFinite(rawLoc.longitude)
        ? { latitude: rawLoc.latitude, longitude: rawLoc.longitude }
        : null;

    account.PetID = Array.isArray(raw.PetID) ? raw.PetID : [];
    account.ActiveSearches = Array.isArray(raw.ActiveSearches) ? raw.ActiveSearches : [];
    account.SearchHistory = Array.isArray(raw.SearchHistory) ? raw.SearchHistory : [];
    account.YourSearches = Array.isArray(raw.YourSearches) ? raw.YourSearches : [];
    account.AuthenticationAgent = String(raw.AuthenticationAgent ?? 'Password');

    // Keep camelCase aliases in sync
    account.firstName = account.FirstName;
    account.radius = account.Radius;
    account.location = account.Location;
    account.role = account.Role;

    return account;
  }

  get fullName(): string {
    return [this.FirstName, this.LastName].filter(Boolean).join(' ').trim();
  }

  get displayName(): string {
    if (this.fullName) return this.fullName;
    const atIndex = this.Email.indexOf('@');
    return atIndex > 0 ? this.Email.slice(0, atIndex) : this.Email || this.id;
  }

  get isShelter(): boolean {
    return this.Role === UserRole.SHELTER;
  }

  get isAdmin(): boolean {
    return this.Role === UserRole.ADMIN;
  }
}
