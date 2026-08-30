import Link from 'next/link'
import { logIn } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <PageShell title="로그인" width="sm" top="auth">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <Card as="form" action={logIn} className="flex flex-col gap-4">
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required />
        <Button type="submit" size="lg">
          로그인
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="underline">
          회원가입
        </Link>
      </p>
    </PageShell>
  )
}
