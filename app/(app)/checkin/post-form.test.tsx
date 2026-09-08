import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

const originalCreateObjectURL = global.URL.createObjectURL
const originalRevokeObjectURL = global.URL.revokeObjectURL

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url')
  global.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  global.URL.createObjectURL = originalCreateObjectURL
  global.URL.revokeObjectURL = originalRevokeObjectURL
})

describe('PostForm', () => {
  it('renders a required photo input, no goals by default, and the submit button', () => {
    render(<PostForm />)

    expect(screen.getByLabelText('책상 인증 사진')).toBeRequired()
    expect(screen.queryByPlaceholderText(/목표/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
  })

  it('shows no preview before a photo is selected', () => {
    render(<PostForm />)

    expect(screen.queryByAltText('선택한 사진 미리보기')).not.toBeInTheDocument()
  })

  it('shows a thumbnail preview and file name after selecting a photo', () => {
    render(<PostForm />)

    const photo = new File(['fake-image-bytes'], 'desk.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('책상 인증 사진'), { target: { files: [photo] } })

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(photo)
    expect(screen.getByAltText('선택한 사진 미리보기')).toHaveAttribute('src', 'blob:mock-preview-url')
    expect(screen.getByText('desk.jpg')).toBeInTheDocument()
  })

  it('replaces the preview when a second photo is selected', () => {
    render(<PostForm />)

    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' })
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('책상 인증 사진')

    fireEvent.change(input, { target: { files: [first] } })
    fireEvent.change(input, { target: { files: [second] } })

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview-url')
    expect(screen.getByText('second.jpg')).toBeInTheDocument()
    expect(screen.queryByText('first.jpg')).not.toBeInTheDocument()
  })

  it('adds a goal field when clicking the add-goal button', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
  })

  it('adds a second goal field on a second click', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 2')).toBeInTheDocument()
  })

  it('removes a goal field when clicking its delete button', () => {
    render(<PostForm />)
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    fireEvent.change(screen.getByPlaceholderText('목표 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('목표 2'), { target: { value: 'B' } })

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByPlaceholderText('목표 2')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 1')).toHaveValue('B')
  })

  it('renders a drag handle for each goal field', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getAllByRole('button', { name: '순서 변경' })).toHaveLength(2)
  })
})
