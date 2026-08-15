import { describe, it, expect, vi } from 'vitest'
import { queryIfAny } from './query-if-any'

describe('queryIfAny', () => {
  it('returns empty data without calling the query when ids is empty', async () => {
    const query = vi.fn()
    const result = await queryIfAny([], query)
    expect(result).toEqual({ data: [] })
    expect(query).not.toHaveBeenCalled()
  })

  it('calls the query and returns its result when ids is non-empty', async () => {
    const query = vi.fn(async () => ({ data: [{ id: '1' }] }))
    const result = await queryIfAny(['a'], query)
    expect(query).toHaveBeenCalled()
    expect(result).toEqual({ data: [{ id: '1' }] })
  })
})
