import { PageShell } from '@/components/ui/page-shell'

export default function PendingPage() {
  return (
    <PageShell title="승인 대기 중입니다" width="sm" top="auth" align="center">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        관리자가 가입 신청을 승인하면 서비스를 이용하실 수 있습니다.
      </p>
    </PageShell>
  )
}
