import { describe, it, expect } from 'vitest'
import { extractImagePaths, problemImagePublicPrefix } from './images'

const prefix = problemImagePublicPrefix('https://proj.supabase.co/')

describe('problemImagePublicPrefix', () => {
  it('builds the public object URL prefix without a double slash', () => {
    expect(prefix).toBe('https://proj.supabase.co/storage/v1/object/public/problem-images/')
  })
})

describe('extractImagePaths', () => {
  it('collects keys of this bucket only, deduplicated across sources', () => {
    const description = `그림 ![a](${prefix}u1/x.png) 와 ![](${prefix}u1/y.gif)`
    const constraints = `다시 ![a](${prefix}u1/x.png) 외부 ![b](https://other.example/z.png)`
    expect(extractImagePaths([description, constraints], prefix)).toEqual(['u1/x.png', 'u1/y.gif'])
  })

  it('ignores plain links and bare prefixes', () => {
    expect(extractImagePaths([`[링크](${prefix}u1/x.png) ![](${prefix})`], prefix)).toEqual([])
  })
})
