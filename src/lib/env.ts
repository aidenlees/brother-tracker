import { z } from 'zod'

/**
 * Build-time configuration. Both values are public: the URL is the project's API
 * address and the publishable key maps to the `anon` role, which RLS gives nothing.
 * Never put a secret or service key here (CLAUDE.md, security rule 10).
 *
 * Local: copy both values from `pnpm supabase status` into .env.local (gitignored).
 * Deploy: GitHub repository variables of the same names.
 */
const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith('sb_publishable_', 'must be a publishable key (sb_publishable_…)'),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw)
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(
      `Invalid configuration (${problems}). Set VITE_SUPABASE_URL and ` +
        'VITE_SUPABASE_PUBLISHABLE_KEY; locally, copy them from `pnpm supabase status` into .env.local.',
    )
  }
  return result.data
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= parseEnv(import.meta.env)
  return cached
}
