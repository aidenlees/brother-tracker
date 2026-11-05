import type { PhotoStore } from '@/trackers/fields/photo-store'
import { supabase } from '../supabase'
import { deletePhoto, getPhoto, putPhoto, shrinkToJpeg } from './photos'

/** Signed URLs last 10 minutes or less (CLAUDE.md, security rule 9). */
const SIGNED_URL_SECONDS = 600

/** The PhotoStore the photo field uses, for one signed-in user. */
export function devicePhotoStore(userId: string): PhotoStore {
  const objectUrls = new Map<string, string>()
  return {
    async add(file) {
      const blob = await shrinkToJpeg(file)
      const id = crypto.randomUUID()
      await putPhoto(userId, id, blob)
      return id
    },
    async url(id) {
      const local = await getPhoto(id)
      if (local) {
        const known = objectUrls.get(id)
        if (known) return known
        const url = URL.createObjectURL(local.blob)
        objectUrls.set(id, url)
        return url
      }
      const { data } = await supabase
        .from('attachments')
        .select('storage_path')
        .eq('id', id)
        .maybeSingle()
      if (!data) return null
      const signed = await supabase.storage
        .from('attachments')
        .createSignedUrl(data.storage_path, SIGNED_URL_SECONDS)
      return signed.data?.signedUrl ?? null
    },
    async discard(id) {
      // Only a photo still on the device; an uploaded one stays with its entry's history.
      await deletePhoto(id)
      const url = objectUrls.get(id)
      if (url) URL.revokeObjectURL(url)
      objectUrls.delete(id)
    },
  }
}
