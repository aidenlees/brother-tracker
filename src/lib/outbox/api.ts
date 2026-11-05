/** The outbox's calls to Supabase. RLS decides every one of them. */
import type { Json } from '../database.types'

/** Entry data is a JSON object (validated by Zod before it's queued, and by SQL after). */
type JsonObject = { [key: string]: Json | undefined }
import { supabase } from '../supabase'
import type { ApiResult, OutboxApi } from './sync'

const result = (error: ApiResult['error'], status: number, rows?: number): ApiResult => ({
  error: error ? { code: error.code, message: error.message } : null,
  status,
  rows,
})

export const supabaseOutboxApi: OutboxApi = {
  async insertEntry(row) {
    const { error, status } = await supabase
      .from('entries')
      .insert({ ...row, data: row.data as JsonObject })
    return result(error, status)
  },

  async updateEntry(id, patch) {
    const {
      data: rows,
      error,
      status,
    } = await supabase
      .from('entries')
      .update({ ...patch, data: patch.data as JsonObject | undefined })
      .eq('id', id)
      .select('id')
    return result(error, status, rows?.length ?? 0)
  },

  async findEntryId({ assignment_id, date, plan_item_id }) {
    const query = supabase
      .from('entries')
      .select('id')
      .eq('assignment_id', assignment_id)
      .eq('date', date)
    const { data, error, status } = await (
      plan_item_id ? query.eq('plan_item_id', plan_item_id) : query.is('plan_item_id', null)
    ).maybeSingle()
    return { ...result(error, status), id: data?.id ?? null }
  },

  async insertFollowup(row) {
    const { error, status } = await supabase.from('followups').insert(row)
    return result(error, status)
  },

  async updateFollowup(id, patch) {
    const {
      data: rows,
      error,
      status,
    } = await supabase.from('followups').update(patch).eq('id', id).select('id')
    return result(error, status, rows?.length ?? 0)
  },
}
