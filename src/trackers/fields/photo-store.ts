import { createContext, useContext } from 'react'

/**
 * Where photo fields keep their pictures. The app provides one that shrinks a picked
 * image to a JPEG, keeps it on the device and uploads it once its entry has synced;
 * the photo field itself only ever holds the attachment id.
 */
export type PhotoStore = {
  /** Shrinks and keeps the picked image; resolves to the new attachment id. */
  add: (file: File) => Promise<string>
  /** Something an <img> can show: the local copy, or a signed URL of 10 minutes or less. */
  url: (id: string) => Promise<string | null>
  /** Drops a photo that was replaced or removed before the entry was saved. */
  discard: (id: string) => Promise<void>
}

export const PhotoStoreContext = createContext<PhotoStore | null>(null)

export function usePhotoStore(): PhotoStore | null {
  return useContext(PhotoStoreContext)
}
