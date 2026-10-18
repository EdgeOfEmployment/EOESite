'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Label, Textarea } from '@/components/ui/input'
import { Markdown } from '@/components/markdown'
import { ALLOWED_IMAGE_TYPES } from '@/lib/problems/images'
import { cn } from '@/lib/ui/cn'
import { uploadProblemImage } from './actions'

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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.set('image', file)
    const result = await uploadProblemImage(formData)
    setUploading(false)

    if ('error' in result) {
      setUploadError(result.error)
      return
    }
    const start = textareaRef.current?.selectionStart ?? value.length
    const end = textareaRef.current?.selectionEnd ?? value.length
    onChange(`${value.slice(0, start)}![](${result.url})${value.slice(end)}`)
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
