import Link from 'next/link'
import { requestPasswordReset } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <PageShell title="비밀번호 찾기" width="sm" top="auth">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {sent && (
        <Alert variant="success" className="mb-4">
          입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.
        </Alert>
      )}
      <Card as="form" action={requestPasswordReset} className="flex flex-col gap-4">
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Button type="submit" size="lg">
          재설정 링크 보내기
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/login" className="underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </PageShell>
  )
}
