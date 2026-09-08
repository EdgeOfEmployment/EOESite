import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { DragHandleIcon, SortableItem } from './sortable-item'

describe('SortableItem', () => {
  it('renders children and applies drag listeners to the handle element', () => {
    render(
      <DndContext>
        <SortableContext items={['item-1']}>
          <SortableItem id="item-1">
            {({ attributes, listeners }) => (
              <button type="button" aria-label="순서 변경" {...attributes} {...listeners}>
                <DragHandleIcon />
              </button>
            )}
          </SortableItem>
        </SortableContext>
      </DndContext>
    )

    expect(screen.getByRole('button', { name: '순서 변경' })).toBeInTheDocument()
  })
})
