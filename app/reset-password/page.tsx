import { Suspense } from 'react'
import { updatePassword } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type ResetPasswordSearchParams = { error?: string }

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordSearchParams>
}) {
  return (
    <PageShell title="새 비밀번호 설정" width="sm" top="auth">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Card as="form" action={updatePassword} className="flex flex-col gap-4">
        <Label htmlFor="password" className="sr-only">
          새 비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="새 비밀번호" required minLength={6} />
        <Button type="submit" size="lg">
          비밀번호 변경
        </Button>
      </Card>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ResetPasswordSearchParams>
}) {
  const { error } = await searchParamsPromise

  if (!error) return null

  return (
    <Alert variant="danger" className="mb-4">
      {error}
    </Alert>
  )
}
