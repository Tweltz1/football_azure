import { File, Paths } from 'expo-file-system';

// Scanned recipe photos are copied into the app's documents folder (the picker's copy is temporary).
// Only the file name is stored: iOS can move the documents folder between app updates.

export async function keepPhoto(fromUri: string, recipeId: string): Promise<string | undefined> {
  try {
    const name = `recipe-${recipeId}.jpg`;
    const dest = new File(Paths.document, name);
    if (dest.exists) dest.delete();
    await new File(fromUri).copy(dest);
    return name;
  } catch {
    return undefined;
  }
}

export const photoUri = (name: string) => new File(Paths.document, name).uri;

export function deletePhoto(name: string | undefined) {
  if (!name) return;
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch {}
}
