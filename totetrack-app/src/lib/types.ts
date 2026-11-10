export type Item = {
  id: string;
  name: string;
  qty: number;
  /** Set while the item is out of its tote (lent to someone, taken somewhere). */
  out?: { to: string; at: number };
  /** Expiration date as YYYY-MM-DD (batteries, food, first-aid supplies). */
  expires?: string;
  /** Value of one unit in dollars, for the home inventory report. */
  value?: number;
};

export type Tote = {
  id: string;
  name: string;
  location: string;
  color: string;
  icon: string;
  notes: string;
  /** File name of the photo inside the app's documents/photos folder. */
  photo?: string;
  /** File names (same photos folder) of pictures of what's inside the tote, newest first. */
  insidePhotos?: string[];
  /** Season or holiday this tote is for (see SEASONS), so the app can remind you before it comes up. */
  season?: string;
  /** Moving mode: the room this tote goes to at the new place. */
  moveTo?: string;
  /** Moving mode: when the tote was scanned as unloaded. */
  unloadedAt?: number;
  items: Item[];
  createdAt: number;
  updatedAt: number;
};

export type ToteInput = Pick<Tote, 'name' | 'location' | 'color' | 'icon' | 'notes' | 'photo' | 'season' | 'moveTo' | 'unloadedAt'>;
