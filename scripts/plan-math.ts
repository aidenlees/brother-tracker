/**
 * `pnpm plan:math`: rebuilds seed/math_sessions.json, six days a week (see
 * plan-math-build.ts for the rules). Run it after changing the rules or the estimate,
 * then `pnpm seed` to update the plan template. Students already assigned keep their
 * plan items until the admin rebuilds them.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PlanFile } from '../src/trackers/definition.ts'
import { buildMathPlan } from './plan-math-build.ts'

const file = new URL('../seed/math_sessions.json', import.meta.url)
const plan = buildMathPlan(PlanFile.parse(JSON.parse(readFileSync(file, 'utf8'))))
writeFileSync(file, `${JSON.stringify(PlanFile.parse(plan), null, 1)}\n`)
const last = plan.sessions[plan.sessions.length - 1]
console.log(
  `plan:math: ${String(plan.sessions.length)} sessions, ${plan.sessions[0]?.date ?? ''} to ${last?.date ?? ''}`,
)
