import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { TOUR_BASE_PATH } from './load-fixtures'

const REPO_URL = 'https://github.com/EdgeOfEmployment/EOESite'
const AUTHOR_URL = 'https://github.com/Kimd0ng'

const FEATURES = [
  { href: '/dashboard', title: '대시보드', body: '오늘 누가 10시 인증을 했는지, 이번 주 내 코테 문제, 이번 달 벌금 정산을 한 화면에.' },
  { href: '/checkin', title: '10시 인증', body: '책상 사진과 오늘의 목표를 올려요. 10시를 넘기면 지각 벌금이 자동으로 계산돼요.' },
  { href: '/coding', title: '코테 스터디', body: '주차별 문제와 담당자. GitHub에 풀이를 푸시하면 완료 체크가 저절로 찍혀요.' },
  { href: '/problems', title: '문제은행', body: '기출을 복원해 올리면 C·JavaScript·Python·Java 채점 파일을 바로 내려받을 수 있어요.' },
  { href: '/jobposts', title: '자소서 / 공고', body: '1일 1공고 인증과, 문장 단위로 댓글을 다는 자소서 피드백.' },
  { href: '/interviews', title: '모의면접', body: '세션을 열고 참석을 모은 뒤, 받은 질문과 답변에 다시 피드백을 주고받아요.' },
]

const HIGHLIGHTS = [
  {
    title: '승인제 가입 + Postgres RLS',
    body: '가입하면 관리자가 승인할 때까지 대기 화면만 보입니다. 화면 단의 리다이렉트와 별개로, 승인된 멤버만 행을 읽고 쓸 수 있다는 규칙을 DB의 Row Level Security로 한 번 더 강제합니다.',
  },
  {
    title: 'GitHub 푸시 → 코테 자동 체크',
    body: 'GitHub 웹훅의 HMAC 서명을 검증한 뒤, 푸시한 사람의 GitHub 아이디로 멤버를, 바뀐 파일 경로에 든 키워드로 문제를 찾아 완료 처리합니다. 본인이 직접 누른 완료와는 source 컬럼으로 구분해 배지를 다르게 보여줍니다.',
  },
  {
    title: 'Next.js 16 Cache Components로 즉시 이동',
    body: "'use cache'와 태그 단위 무효화로 탭 이동을 즉시 처리합니다. 도입 중 revalidatePath가 같은 경로의 다른 캐시까지 모두 버린다는 사실을 프레임워크 코드에서 찾아내, 쓰기마다 해당 날짜의 태그만 무효화하도록 바꿨습니다.",
  },
  {
    title: '벌금 자동 계산과 정산',
    body: '10시 이후 인증은 기본 10,000원에 5분마다 1,000원씩 붙습니다. 지각 벌금과 관리자가 매긴 벌금을 월별로 합쳐 미납액을 보여줍니다.',
  },
]

const STACK = ['Next.js 16 (App Router, Cache Components)', 'React 19', 'Supabase (Auth · Postgres · Storage)', 'Tailwind CSS 4', 'Vitest · Testing Library · Playwright', 'Vercel']

export default function TourIntroPage() {
  return (
    <PageShell title="EOE 둘러보기">
      <p className="text-gray-700 dark:text-gray-300">
        5~15명 규모 취업 스터디의 매일 10시 인증, 코딩테스트, 자소서 피드백, 모의면접을 한곳에서 운영하는 사이트입니다.
        2026년 7월에 만들기 시작해 실제 스터디에서 쓰고 있어요. 이 둘러보기는 가상의 멤버 6명이 활동 중인 모습을 그대로 보여주며, 무엇을 눌러도 저장되지 않습니다.
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        당신은 가상 멤버 &lsquo;나 (체험)&rsquo;로 로그인한 상태예요.
      </p>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기능 둘러보기</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.href}>
            <Link href={`${TOUR_BASE_PATH}${feature.href}`} className="block h-full">
              <Card className="h-full hover:bg-gray-50 dark:hover:bg-gray-900">
                <p className="font-medium">{feature.title} →</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{feature.body}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        관리자는 여기에 더해 가입 승인, 벌금 부과와 납부 처리, 코테 주차와 문제 등록을 할 수 있어요.
      </p>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기술적으로 공들인 점</h2>
      <div className="flex flex-col gap-3">
        {HIGHLIGHTS.map((highlight) => (
          <Card key={highlight.title}>
            <p className="font-medium">{highlight.title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{highlight.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기술 스택</h2>
      <ul className="flex flex-wrap gap-2">
        {STACK.map((item) => (
          <li key={item} className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700">
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
          GitHub 저장소
        </a>
        {' · 만든 사람 '}
        <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="underline">
          @Kimd0ng
        </a>
      </p>
    </PageShell>
  )
}
