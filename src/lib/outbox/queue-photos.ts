import type { FieldDefinition } from '@/trackers/definition'
import { getPhoto } from './photos'
import type { Op } from './types'

/**
 * After an entry is queued: queue the upload of each of its photos that is still only
 * on this device. Already-uploaded photos (an edit that kept them) need nothing.
 */
export async function queuePhotos(
  enqueue: (op: Op) => Promise<void>,
  fields: readonly FieldDefinition[],
  data: Readonly<Record<string, unknown>>,
  entryId: string,
  ownerId: string,
): Promise<void> {
  for (const field of fields) {
    if (field.type !== 'photo') continue
    const id = data[field.key]
    if (typeof id === 'string' && (await getPhoto(id))) {
      await enqueue({ kind: 'photo.upload', id, entry_id: entryId, owner_id: ownerId })
    }
  }
}
