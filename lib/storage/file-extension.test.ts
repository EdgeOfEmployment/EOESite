import { describe, it, expect } from 'vitest'
import { resolveExtension } from './file-extension'

describe('resolveExtension', () => {
  it('keeps an ASCII extension and drops everything else', () => {
    expect(resolveExtension('스크린샷 2026-08-14 143253.png')).toBe('.png')
    expect(resolveExtension('photo.JPEG')).toBe('.JPEG')
    expect(resolveExtension('no-extension')).toBe('')
  })
})
