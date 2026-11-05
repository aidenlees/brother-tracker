/**
 * Notebook photos on the device. A picked image is shrunk to a JPEG here (storage only
 * takes image/jpeg, up to 5 MB) and kept in IndexedDB under its attachment id until the
 * outbox has uploaded it. The photo field holds only that id.
 *
 * No Supabase here: the sync engine (and its tests) use this module, and must not need a
 * configured client. device-photo-store.ts adds the signed URLs.
 */
import { createStore, del, get, set, type UseStore } from 'idb-keyval'

/** Long edge of a stored photo: plenty to read a notebook page. */
export const MAX_EDGE = 1600
const MAX_BYTES = 5 * 1024 * 1024

type StoredPhoto = { id: string; userId: string; blob: Blob; createdAt: string }

let db: UseStore | null = null
const photos = () => (db ??= createStore('practice-tracker-photos', 'photos'))

export function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return get<StoredPhoto>(id, photos())
}

export async function putPhoto(userId: string, id: string, blob: Blob): Promise<void> {
  await set(id, { id, userId, blob, createdAt: new Date().toISOString() }, photos())
}

export function deletePhoto(id: string): Promise<void> {
  return del(id, photos())
}

/** Draws the image no larger than MAX_EDGE and encodes it as a JPEG under 5 MB. */
export async function shrinkToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas to draw the photo on')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((done) => {
      canvas.toBlob(done, 'image/jpeg', quality)
    })
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('The photo is too large even after shrinking')
}
