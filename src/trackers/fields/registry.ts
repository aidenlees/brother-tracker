/**
 * The field registry (CLAUDE.md, "Field types"). Typed as a Record over every name in
 * FIELD_TYPES, so a type without an implementation fails typecheck; seed-sql.test.ts
 * checks each one also has its public.field_check_<type> in the migrations.
 */
import type { FieldTypeName } from '../definition'
import checkbox from './checkbox'
import checklist from './checklist'
import type { FieldType } from './contract'
import counter from './counter'
import duration from './duration'
import long_text from './long_text'
import multi_select from './multi_select'
import number from './number'
import page_range from './page_range'
import photo from './photo'
import rating_1_5 from './rating_1_5'
import select from './select'
import short_text from './short_text'
import tally_group from './tally_group'
import yes_no from './yes_no'

export const FIELD_REGISTRY: Record<FieldTypeName, FieldType<unknown>> = {
  number,
  counter,
  tally_group,
  checkbox,
  checklist,
  select,
  multi_select,
  short_text,
  long_text,
  duration,
  rating_1_5,
  page_range,
  yes_no,
  photo,
}
