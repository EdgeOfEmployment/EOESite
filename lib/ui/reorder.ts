import { arrayMove } from '@dnd-kit/sortable'

export function reorderById<T>(
  items: T[],
  activeId: string,
  overId: string,
  getId: (item: T) => string
): T[] {
  if (activeId === overId) return items

  const oldIndex = items.findIndex((item) => getId(item) === activeId)
  const newIndex = items.findIndex((item) => getId(item) === overId)

  if (oldIndex === -1 || newIndex === -1) return items

  return arrayMove(items, oldIndex, newIndex)
}
