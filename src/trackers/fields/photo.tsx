import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { defineFieldType, type FieldProps } from './contract'
import { usePhotoStore } from './photo-store'

/** The attachment id, lower-case as public.field_check_photo requires. */
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** One photo. The value is the id of its row in attachments; the image lives in Storage. */
export default defineFieldType<string>({
  schema: () =>
    z
      .string({ error: 'must be an uploaded photo' })
      .regex(ATTACHMENT_ID, 'must be an uploaded photo'),
  empty: () => null,
  summary: () => 'Photo',
  Renderer: Photo,
})

function Photo({ field, value, onChange, labelId, describedBy, autoFocus }: FieldProps<string>) {
  const store = usePhotoStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!store || !value) return
    let current = true
    void store.url(value).then((url) => {
      if (current) setSrc(url)
    })
    return () => {
      current = false
    }
  }, [store, value])

  if (!store) {
    return <p className="text-muted-foreground">Photos can’t be added on this screen.</p>
  }

  async function pick(file: File | undefined) {
    if (!file || !store) return
    setBusy(true)
    setProblem(null)
    try {
      const id = await store.add(file)
      if (value) await store.discard(value)
      onChange(id)
    } catch {
      setProblem('That photo couldn’t be read here. Try a JPEG or PNG.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-3"
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
        }}
      />
      {value && src ? (
        <img
          src={src}
          alt={`${field.label}, as added`}
          className="max-h-72 w-auto self-start rounded-lg border border-border object-contain"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          autoFocus={autoFocus}
          onClick={() => input.current?.click()}
        >
          <ImagePlus aria-hidden />
          {busy ? 'Adding…' : value ? 'Replace photo' : 'Add a photo'}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void store.discard(value)
              setSrc(null)
              onChange(null)
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
