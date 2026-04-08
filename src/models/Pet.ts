export class Pet {
  /** Firestore document id */
  id: string = '';
  /** Alias for id — some callers use docId */
  docId: string = '';
  OwnerID: string = '';
  Name: string = '';
  Type: string = '';
  Breed: string = '';
  Color: string[] = [];
  /** Age is optional and may not be present on all records */
  Age: number | undefined = undefined;
  Size: string = '';
  /** Filename or remote URL; null when no image is stored */
  Image: string | null = null;
  ImageType: string = '';
  /** 1 = active, 0 = deactivated */
  Status: number = 1;

  /**
   * Build a Pet from a raw Firestore document, a value from getUserPets(),
   * or a mapPetRecord() result. Missing / invalid fields use defaults.
   */
  static from(raw: any): Pet {
    const pet = new Pet();
    if (!raw) {
      return pet;
    }

    pet.id = raw.id ?? raw.docId ?? '';
    pet.docId = pet.id;
    pet.OwnerID = String(raw.OwnerID ?? raw.ownerId ?? '');
    pet.Name = String(raw.Name ?? raw.name ?? '');
    pet.Type = String(raw.Type ?? raw.type ?? '');
    pet.Breed = String(raw.Breed ?? raw.breed ?? '');

    const rawColor = raw.Color ?? raw.color;
    if (Array.isArray(rawColor)) {
      pet.Color = rawColor.map(String);
    } else if (typeof rawColor === 'string' && rawColor.length > 0) {
      pet.Color = rawColor.split(',').map((c) => c.trim()).filter(Boolean);
    } else {
      pet.Color = [];
    }

    const parsedAge = Number(raw.Age ?? raw.age);
    pet.Age = Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge : undefined;

    pet.Size = String(raw.Size ?? raw.size ?? '');
    pet.Image = raw.Image ?? raw.image ?? null;
    pet.ImageType = String(raw.ImageType ?? raw.imageType ?? '');

    const parsedStatus = Number(raw.Status ?? raw.status ?? 1);
    pet.Status = parsedStatus === 0 ? 0 : 1;

    return pet;
  }

  get isActive(): boolean {
    return this.Status === 1;
  }

  get colorLabel(): string {
    return this.Color.join(', ');
  }
}
