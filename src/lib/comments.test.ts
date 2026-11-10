import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { authorNames, parseComment, parseComments, writeError } = await import('./comments')

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  entry_id: 'e1',
  author_id: 'u1',
  body: 'Draw the bar model first.',
  created_at: '2026-11-10T01:15:00+00:00',
  edited_at: null,
  author: { display_name: 'Alex' },
  ...over,
})

describe('comments', () => {
  it('reads a comment with its author’s first name', () => {
    expect(parseComment(row())).toEqual({
      id: 'c1',
      entryId: 'e1',
      authorId: 'u1',
      author: 'Alex',
      body: 'Draw the bar model first.',
      createdAt: '2026-11-10T01:15:00+00:00',
      editedAt: null,
    })
  })

  it('keeps a comment whose author can’t be read, and drops a malformed row', () => {
    expect(parseComment(row({ author: null }))?.author).toBeNull()
    expect(parseComment(row({ body: 4 }))).toBeNull()
    expect(parseComment('nope')).toBeNull()
  })

  it('reads a conversation oldest first', () => {
    const list = parseComments([
      row({ id: 'late', created_at: '2026-11-10T03:00:00+00:00' }),
      row({ id: 'early', created_at: '2026-11-09T03:00:00+00:00' }),
      'junk',
    ])
    expect(list.map((c) => c.id)).toEqual(['early', 'late'])
    expect(parseComments(null)).toEqual([])
  })

  it('names who wrote a thread, each once, in the order they joined', () => {
    const by = (name: string | null) =>
      parseComment(row({ author: name && { display_name: name } }))
    const thread = [by('Alex'), by('Jordan'), by('Alex'), by(null)].filter((c) => c !== null)
    expect(authorNames(thread.slice(0, 1))).toBe('Alex')
    expect(authorNames(thread.slice(0, 3))).toBe('Alex and Jordan')
    expect(authorNames(thread)).toBe('Alex, Jordan and Someone')
  })

  it('says why a write failed: refused by the server, or no connection', () => {
    expect(writeError({ code: '42501', message: 'new row violates…' }, 'Not yours.').message).toBe(
      'Not yours.',
    )
    expect(writeError({ code: '23514', message: 'check' }, 'Not yours.').message).toBe(
      'It didn’t go through. Reload and try again.',
    )
    expect(writeError({ code: '', message: 'TypeError: Failed to fetch' }, 'x').message).toBe(
      'Couldn’t reach the server. Check your connection, then try again.',
    )
  })
})
