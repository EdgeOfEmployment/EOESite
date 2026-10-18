'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Label, Textarea } from '@/components/ui/input'
import { Markdown } from '@/components/markdown'
import { ALLOWED_IMAGE_TYPES } from '@/lib/problems/images'
import { cn } from '@/lib/ui/cn'
import { uploadProblemImage } from './actions'

/**
 * Puts `block` in its own paragraph. Glued to surrounding text — say the end of a table row —
 * Markdown would read the image as part of that line (an extra table cell is silently dropped).
 */
function insertAsParagraph(before: string, block: string, after: string): string {
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  return `${before}${lead}${block}${trail}${after}`
}

export function MarkdownField({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const start = textareaRef.current?.selectionStart ?? value.length
    const end = textareaRef.current?.selectionEnd ?? start
    setUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.set('image', file)
    try {
      const result = await uploadProblemImage(formData)
      if ('error' in result) {
        setUploadError(result.error)
        return
      }
      const current = valueRef.current
      const s = Math.min(start, current.length)
      const e = Math.min(end, current.length)
      onChange(insertAsParagraph(current.slice(0, s), `![](${result.url})`, current.slice(e)))
    } catch {
      setUploadError('이미지를 올리지 못했어요. 다시 시도해주세요')
    } finally {
      setUploading(false)
    }
  }

  const tabClass = (active: boolean) =>
    cn('rounded px-2 py-1', active ? 'bg-gray-200 font-medium dark:bg-gray-800' : 'text-gray-500 dark:text-gray-400')

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-1 text-xs" role="tablist" aria-label={`${label} 보기 방식`}>
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
            작성
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
            미리보기
          </button>
        </div>
      </div>
      {tab === 'write' ? (
        <Textarea id={id} ref={textareaRef} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      ) : (
        <div className="min-h-24 rounded border border-gray-300 p-3 dark:border-gray-700">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-gray-400">미리볼 내용이 없어요.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className="underline disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || tab !== 'write'}
        >
          {uploading ? '업로드 중…' : '이미지 추가'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          className="hidden"
          aria-label={`${label} 이미지 파일`}
          onChange={handleFile}
        />
        <span className="text-gray-500 dark:text-gray-400">마크다운을 쓸 수 있어요.</span>
        {uploadError && <span className="text-red-600 dark:text-red-400">{uploadError}</span>}
      </div>
    </div>
  )
}
