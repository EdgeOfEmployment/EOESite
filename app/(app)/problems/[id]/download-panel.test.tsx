import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadPanel } from './download-panel'
import type { ProblemContent } from '@/lib/problems/types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
}

describe('DownloadPanel', () => {
  it('previews the generated file for the selected language', () => {
    render(<DownloadPanel problemId="p-1" problem={problem} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Java' }))
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }))
    expect(screen.getByText('Solution.java')).toBeInTheDocument()
    expect(screen.getByText(/public class Solution/)).toBeInTheDocument()
    expect(screen.getByText(/문제 페이지: http:\/\/localhost(:\d+)?\/problems\/p-1/)).toBeInTheDocument()
  })

  it('downloads a blob named after the language file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<DownloadPanel problemId="p-1" problem={problem} />)
    fireEvent.click(screen.getByRole('radio', { name: 'C' }))
    fireEvent.click(screen.getByRole('button', { name: '파일 다운로드' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('solution.c')
    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
