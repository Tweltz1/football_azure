import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a picked image into permanent storage and returns its file name. */
export async function savePhoto(sourceUri: string): Promise<string> {
  const ext = sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const name = `${Crypto.randomUUID()}.${ext}`;
  await new File(sourceUri).copy(new File(photoDir(), name));
  return name;
}

/** Resolves a stored photo name to a URI (the documents path can change between app updates). */
export function photoUri(name?: string): string | undefined {
  if (!name) return undefined;
  return new File(photoDir(), name).uri;
}

export function deletePhoto(name?: string) {
  if (!name) return;
  try {
    const f = new File(photoDir(), name);
    if (f.exists) f.delete();
  } catch {
    // best effort
  }
}
