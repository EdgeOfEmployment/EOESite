import { describe, it, expect } from 'vitest'
import { reorderById } from './reorder'

interface Item {
  id: string
  label: string
}

const items: Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
]

describe('reorderById', () => {
  it('moves an item to a later position', () => {
    const result = reorderById(items, 'a', 'c', (item) => item.id)
    expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item to an earlier position', () => {
    const result = reorderById(items, 'c', 'a', (item) => item.id)
    expect(result.map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns the same order when activeId equals overId', () => {
    const result = reorderById(items, 'b', 'b', (item) => item.id)
    expect(result).toEqual(items)
  })

  it('returns the original array when an id is not found', () => {
    const result = reorderById(items, 'a', 'missing', (item) => item.id)
    expect(result).toEqual(items)
  })
})
