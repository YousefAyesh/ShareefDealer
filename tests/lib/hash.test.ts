import { describe, it, expect } from 'vitest'
import { sha256Hex, stableHash } from '@/lib/hash'

describe('sha256Hex', () => {
  it('hashes a buffer deterministically', () => {
    const a = sha256Hex(Buffer.from('hello'))
    const b = sha256Hex(Buffer.from('hello'))
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('produces different hashes for different content', () => {
    expect(sha256Hex(Buffer.from('a'))).not.toBe(sha256Hex(Buffer.from('b')))
  })
})

describe('stableHash', () => {
  it('ignores key order', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
  })

  it('changes when a value changes', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }))
  })

  it('treats nested objects consistently', () => {
    expect(stableHash({ a: { x: 1, y: 2 } })).toBe(stableHash({ a: { y: 2, x: 1 } }))
  })
})
