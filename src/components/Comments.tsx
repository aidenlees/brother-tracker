import { useEffect, useId, useRef, useState, type SyntheticEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { COMMENT_MAX, useCommentWrites, type Comment } from '@/lib/comments'
import { formatMoment } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'

type Heading = 'h2' | 'h3' | 'h4'

/** Ctrl+Enter or Cmd+Enter sends; Enter alone starts a new line, as in any message box. */
const isSend = (e: KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey)

/**
 * A log's comments, oldest first, and a box to add one. Your own say "You" and can be
 * edited or deleted. Writing needs a connection; if it fails, what was typed stays.
 */
export function Thread({
  entryId,
  comments,
  heading: H = 'h3',
  prompt = 'Add a comment',
}: {
  entryId: string
  comments: readonly Comment[]
  heading?: Heading
  /** The box's label: "Add a comment", or "Reply" where someone else started. */
  prompt?: string
}) {
  const { userId } = useOutbox()
  const writes = useCommentWrites()
  const headingId = useId()
  const boxId = useId()
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')

  async function send(e?: SyntheticEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text || writes.post.isPending) return
    setNotice('')
    await writes.post.mutateAsync({ entryId, body: text }).then(
      () => {
        setBody('')
        setNotice('Comment posted.')
      },
      () => undefined,
    )
  }

  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-4">
      <H id={headingId} className="text-body text-foreground">
        Comments
      </H>
      {comments.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              mine={comment.authorId === userId}
              writes={writes}
              onNotice={setNotice}
            />
          ))}
        </ul>
      ) : null}
      <form onSubmit={(e) => void send(e)} className="flex flex-col gap-2">
        <label htmlFor={boxId} className="text-small text-muted-foreground">
          {prompt}
        </label>
        <Textarea
          id={boxId}
          rows={2}
          maxLength={COMMENT_MAX}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
          }}
          onKeyDown={(e) => {
            if (isSend(e)) void send(e)
          }}
          className="min-h-16"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!body.trim() || writes.post.isPending}
          >
            {writes.post.isPending ? 'Posting…' : 'Post'}
          </Button>
          {writes.post.error ? (
            <p role="alert" className="text-small text-destructive">
              {writes.post.error.message}
            </p>
          ) : null}
        </div>
      </form>
      <p role="status" className="sr-only empty:hidden">
        {notice}
      </p>
    </div>
  )
}

function CommentItem({
  comment,
  mine,
  writes,
  onNotice,
}: {
  comment: Comment
  mine: boolean
  writes: ReturnType<typeof useCommentWrites>
  onNotice: (notice: string) => void
}) {
  const [mode, setMode] = useState<'read' | 'edit' | 'delete'>('read')
  const [draft, setDraft] = useState(comment.body)
  const editId = useId()
  const questionId = useId()
  const keep = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  // Errors belong to the comment they were for.
  const editError = writes.edit.variables?.id === comment.id ? writes.edit.error : null
  const deleteError = writes.remove.variables === comment.id ? writes.remove.error : null

  useEffect(() => {
    if (mode === 'delete') keep.current?.focus()
    if (mode === 'edit') box.current?.focus()
  }, [mode])

  async function save(e?: SyntheticEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || writes.edit.isPending) return
    if (text === comment.body) {
      setMode('read')
      return
    }
    await writes.edit.mutateAsync({ id: comment.id, body: text }).then(
      () => {
        setMode('read')
        onNotice('Comment saved.')
      },
      () => undefined,
    )
  }

  return (
    <li className="flex flex-col gap-1">
      <p className="text-small text-muted-foreground">
        <span className="font-medium text-foreground">
          {mine ? 'You' : (comment.author ?? 'Someone')}
        </span>
        {' · '}
        <time dateTime={comment.createdAt}>{formatMoment(comment.createdAt)}</time>
        {comment.editedAt ? ' · edited' : ''}
      </p>
      {mode === 'edit' ? (
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2">
          <label htmlFor={editId} className="sr-only">
            Edit your comment
          </label>
          <Textarea
            ref={box}
            id={editId}
            rows={2}
            maxLength={COMMENT_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
            }}
            onKeyDown={(e) => {
              if (isSend(e)) void save(e)
              if (e.key === 'Escape') setMode('read')
            }}
            className="min-h-16"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!draft.trim() || writes.edit.isPending}
            >
              {writes.edit.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(comment.body)
                setMode('read')
              }}
            >
              Cancel
            </Button>
          </div>
          {editError ? (
            <p role="alert" className="text-small text-destructive">
              {editError.message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="whitespace-pre-line text-foreground">{comment.body}</p>
      )}
      {mine && mode === 'read' ? (
        <div className="flex gap-4">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-muted-foreground"
            aria-label="Edit your comment"
            onClick={() => {
              setDraft(comment.body)
              setMode('edit')
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-muted-foreground"
            aria-label="Delete your comment"
            onClick={() => {
              setMode('delete')
            }}
          >
            Delete
          </Button>
        </div>
      ) : null}
      {mode === 'delete' ? (
        <div
          role="group"
          aria-labelledby={questionId}
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMode('read')
          }}
        >
          <p id={questionId} className="text-small text-foreground">
            Delete this comment? It can’t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={writes.remove.isPending}
              onClick={() => {
                void writes.remove.mutateAsync(comment.id).then(
                  () => {
                    onNotice('Comment deleted.')
                  },
                  () => undefined,
                )
              }}
            >
              Delete
            </Button>
            <Button
              ref={keep}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('read')
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      {deleteError ? (
        <p role="alert" className="text-small text-destructive">
          {deleteError.message}
        </p>
      ) : null}
    </li>
  )
}
