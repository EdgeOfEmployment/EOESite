import Link from 'next/link'
import type { CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import { formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { EmptyState } from '@/components/ui/empty-state'

// Pure markup for /coding's board boundary in page.tsx, which keeps all the data reads and
// caching. /tour renders this same view from fixtures.

export function CodingBoardView({
  isAdmin,
  members,
  currentWeek,
  prevId,
  nextId,
  problems,
  currentUserId,
  basePath = '',
}: {
  isAdmin: boolean
  members: Member[]
  currentWeek: CodingWeek | null
  prevId: string | null
  nextId: string | null
  problems: CodingProblem[]
  currentUserId: string
  basePath?: string
}) {
  return (
    <>
      {isAdmin && <ProblemForm members={members} currentWeek={currentWeek} />}
      <div className="mt-6 flex flex-col gap-4">
        {currentWeek ? (
          <>
            <div className="flex items-center justify-between">
              {prevId ? (
                <Link href={`${basePath}/coding?week=${prevId}`} className="text-sm underline">
                  ← 이전 주차
                </Link>
              ) : (
                <span />
              )}
              <h2 className="text-lg font-semibold">{formatWeekHeader(currentWeek)}</h2>
              {nextId ? (
                <Link href={`${basePath}/coding?week=${nextId}`} className="text-sm underline">
                  다음 주차 →
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="flex flex-col gap-3">
              {problems.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                />
              ))}
              {problems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
            </div>
          </>
        ) : (
          <EmptyState message="아직 등록된 문제가 없습니다." />
        )}
      </div>
    </>
  )
}
