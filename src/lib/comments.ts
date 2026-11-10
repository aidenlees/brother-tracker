/**
 * Comments on a log (CLAUDE.md security rule 7): the admin and linked viewers start them
 * on Struggles; the student reads and replies on the session's page. RLS decides who
 * reads and writes. Each comment carries its author's first name, readable to whoever
 * can read the comment (the profiles_select policy).
 *
 * Writing a comment needs a connection: it goes straight to the server, and if that
 * fails what was typed stays in the box (unlike entries, comments have no outbox).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

/** The longest comment the database takes (comments.body check). */
export const COMMENT_MAX = 4000

/** How long a comment shows on the student's Today. */
export const RECENT_COMMENT_DAYS = 7

export type Comment = {
  id: string
  entryId: string
  authorId: string
  /** The author's first name; null if their profile can't be read (it always can, by policy). */
  author: string | null
  body: string
  createdAt: string
  editedAt: string | null
}

/** The columns a Comment is read from, for a select of comments or an embed of them. */
export const COMMENT_COLUMNS =
  'id, entry_id, author_id, body, created_at, edited_at, author:profiles!comments_author_id_fkey(display_name)'

export function parseComment(row: unknown): Comment | null {
  if (!isRecord(row)) return null
  const { id, entry_id, author_id, body, created_at, edited_at, author } = row
  if (
    typeof id !== 'string' ||
    typeof entry_id !== 'string' ||
    typeof author_id !== 'string' ||
    typeof body !== 'string' ||
    typeof created_at !== 'string'
  ) {
    return null
  }
  return {
    id,
    entryId: entry_id,
    authorId: author_id,
    author:
      isRecord(author) && typeof author.display_name === 'string' ? author.display_name : null,
    body,
    createdAt: created_at,
    editedAt: typeof edited_at === 'string' ? edited_at : null,
  }
}

/** Oldest first, the order a conversation reads in. */
export function parseComments(rows: unknown): Comment[] {
  return (Array.isArray(rows) ? rows : [])
    .map(parseComment)
    .filter((c): c is Comment => c !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

/** "Alex", "Alex and Jordan", "Alex, Jordan and Sam": who wrote these, first come first. */
export function authorNames(comments: readonly Comment[]): string {
  const names = [...new Set(comments.map((c) => c.author ?? 'Someone'))]
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/** One log's comments, oldest first. */
export function useEntryComments(entryId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'comments', 'entry', entryId],
    enabled: entryId !== undefined,
    // Fresh each time the page opens: someone may have just replied.
    staleTime: 0,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(COMMENT_COLUMNS)
        .eq('entry_id', entryId ?? '')
      if (error) throw error
      return parseComments(data)
    },
  })
}

/**
 * The student's Today: comments from the last week by someone else, on their logs (RLS
 * shows a student only the comments on their own entries).
 */
export function useRecentComments() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'comments', 'recent'],
    staleTime: 0,
    queryFn: async (): Promise<Comment[]> => {
      const since = new Date(Date.now() - RECENT_COMMENT_DAYS * 24 * 60 * 60 * 1000)
      const { data, error } = await supabase
        .from('comments')
        .select(COMMENT_COLUMNS)
        .neq('author_id', userId)
        .gte('created_at', since.toISOString())
      if (error) throw error
      return parseComments(data)
    },
  })
}

/**
 * A message for a failed write. supabase-js reports a refusal with the Postgres code
 * (42501 from RLS) and a lost connection with no code at all.
 */
export function writeError(error: unknown, refused: string): Error {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
  if (code === '42501') return new Error(refused)
  if (code) return new Error('It didn’t go through. Reload and try again.')
  return new Error('Couldn’t reach the server. Check your connection, then try again.')
}

/** Post, edit and delete your own comments. Each refreshes every list of comments. */
export function useCommentWrites() {
  const { userId } = useOutbox()
  const client = useQueryClient()
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: [userId, 'comments'] }),
      // Overview's log cards count comments.
      client.invalidateQueries({ queryKey: [userId, 'overview', 'logs'] }),
    ])
  }
  const post = useMutation({
    networkMode: 'always',
    mutationFn: async ({ entryId, body }: { entryId: string; body: string }) => {
      const { error } = await supabase.from('comments').insert({ entry_id: entryId, body })
      if (error) throw writeError(error, 'It wasn’t posted: you can’t comment on this log.')
    },
    onSuccess: refresh,
  })
  const edit = useMutation({
    networkMode: 'always',
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from('comments')
        .update({ body })
        .eq('id', id)
        .select('id')
      if (error) throw writeError(error, 'It wasn’t saved: you can only edit your own comments.')
      if (data.length === 0) {
        throw new Error(
          'It wasn’t saved: you can only edit your own comments. Reload and try again.',
        )
      }
    },
    onSuccess: refresh,
  })
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('comments').delete().eq('id', id).select('id')
      if (error)
        throw writeError(error, 'It wasn’t deleted: you can only delete your own comments.')
      if (data.length === 0) {
        throw new Error(
          'It wasn’t deleted: you can only delete your own comments. Reload and try again.',
        )
      }
    },
    onSuccess: refresh,
  })
  return { post, edit, remove }
}
