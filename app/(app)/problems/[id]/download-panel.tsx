'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { generate, LANGUAGES, type Language } from '@/lib/problems/generate'
import type { ProblemContent } from '@/lib/problems/types'
import { cn } from '@/lib/ui/cn'

/**
 * Generation runs in the browser: the file is built from the problem already on the page, and
 * the header's problem URL needs `window.location.origin`. That is also why the preview is only
 * rendered after a click — rendering it during SSR would mismatch on hydration.
 */
export function DownloadPanel({
  problemId,
  problem,
  basePath = '',
}: {
  problemId: string
  problem: ProblemContent
  /** Prefix for the problem URL written into the file header; `/tour` renders this panel inside the demo. */
  basePath?: string
}) {
  const [lang, setLang] = useState<Language>('python')
  const [showPreview, setShowPreview] = useState(false)

  function build() {
    return generate(problem, lang, { problemUrl: `${window.location.origin}${basePath}/problems/${problemId}` })
  }

  function download() {
    const file = build()
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const preview = showPreview ? build() : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="언어 선택">
        {LANGUAGES.map((language) => (
          <button
            key={language.id}
            type="button"
            role="radio"
            aria-checked={lang === language.id}
            onClick={() => setLang(language.id)}
            className={cn(
              'min-h-11 rounded border px-3 text-sm',
              lang === language.id
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'
            )}
          >
            {language.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={download}>
          파일 다운로드
        </Button>
        <Button type="button" variant="secondary" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? '미리보기 닫기' : '미리보기'}
        </Button>
      </div>
      {preview && (
        <div>
          <p className="mb-1 font-mono text-xs text-gray-500">{preview.filename}</p>
          <pre className="max-h-[32rem] overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900">
            <code>{preview.content}</code>
          </pre>
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        파일 맨 위 주석에 실행 방법이 있어요. 풀이를 작성하고 실행하면 모든 테스트 케이스를 채점해요.
      </p>
    </div>
  )
}
