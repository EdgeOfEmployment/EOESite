'use client'

import { Button } from '@/components/ui/button'

export function DeleteProblemButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('이 문제를 삭제할까요? 되돌릴 수 없어요.')) event.preventDefault()
      }}
    >
      <Button type="submit" variant="secondary" size="sm">
        삭제
      </Button>
    </form>
  )
}
