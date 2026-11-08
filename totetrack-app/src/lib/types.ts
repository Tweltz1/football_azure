export type Item = {
  id: string;
  name: string;
  qty: number;
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
  items: Item[];
  createdAt: number;
  updatedAt: number;
};

export type ToteInput = Pick<Tote, 'name' | 'location' | 'color' | 'icon' | 'notes' | 'photo'>;
