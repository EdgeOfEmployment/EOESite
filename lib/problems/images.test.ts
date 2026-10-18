import { describe, it, expect } from 'vitest'
import { extractImagePaths, problemImagePublicPrefix } from './images'

const prefix = problemImagePublicPrefix('https://proj.supabase.co/')
const A = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b/6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.png'
const B = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b/0f1e2d3c-4b5a-4968-8776-655443322110.gif'

describe('problemImagePublicPrefix', () => {
  it('builds the public object URL prefix without a double slash', () => {
    expect(prefix).toBe('https://proj.supabase.co/storage/v1/object/public/problem-images/')
  })
})

describe('extractImagePaths', () => {
  it('collects keys of this bucket only, deduplicated across sources', () => {
    const description = `그림 ![a](${prefix}${A}) 와 ![](${prefix}${B})`
    const constraints = `다시 ![a](${prefix}${A}) 외부 ![b](https://other.example/z.png)`
    expect(extractImagePaths([description, constraints], prefix)).toEqual([A, B])
  })

  it('ignores plain links and bare prefixes', () => {
    expect(extractImagePaths([`[링크](${prefix}${A}) ![](${prefix})`], prefix)).toEqual([])
  })

  it('ignores keys that are not shaped like uploaded objects and strips query strings', () => {
    expect(
      extractImagePaths(
        [`![](${prefix}u1/../u2/x.png) ![](${prefix}${A.replace('/', '/%2E%2E/')}) ![](${prefix}${A}?v=2)`],
        prefix
      )
    ).toEqual([A])
  })
})
