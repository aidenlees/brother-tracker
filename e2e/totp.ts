import { createHmac } from 'node:crypto'

/**
 * The 6-digit code an authenticator app shows for a key (RFC 6238: HMAC-SHA1 over
 * 30-second steps), so the two-step test can sign in like a person with a phone.
 */
export function totp(key: string, at = Date.now(), stepsAhead = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of key.replace(/[\s=]/g, '').toUpperCase()) {
    const value = alphabet.indexOf(char)
    if (value < 0) throw new Error(`Not a base32 key: ${char}`)
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, i) =>
      parseInt(bits.slice(i * 8, i * 8 + 8), 2),
    ),
  )
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000) + stepsAhead))
  const hmac = createHmac('sha1', bytes).update(counter).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf
  const value = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(value % 1_000_000).padStart(6, '0')
}
