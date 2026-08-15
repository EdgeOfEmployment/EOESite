import Link from 'next/link'
import { signUp } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <PageShell title="회원가입" width="sm" top="auth">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <Card as="form" action={signUp} className="flex flex-col gap-4">
        <Label htmlFor="name" className="sr-only">
          이름
        </Label>
        <Input id="name" name="name" placeholder="이름" required />
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required minLength={6} />
        <Button type="submit">가입하기</Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </PageShell>
  )
}
