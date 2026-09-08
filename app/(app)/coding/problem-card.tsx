import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem } from './actions'
import { buildCommitFileUrl } from '@/lib/coding/github-link'
import { Card } from '@/components/ui/card'

export function ProblemCard({
  problem,
  members,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  isAdmin: boolean
}) {
  const targetMembers =
    problem.assigneeIds.length > 0
      ? members.filter((member) => problem.assigneeIds.includes(member.id))
      : members

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <a href={problem.link} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          {problem.title}
        </a>
        {isAdmin && (
          <form action={deleteProblem.bind(null, problem.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {targetMembers.map((member) => {
          const check = problem.checks.find((c) => c.userId === member.id)
          const checked = Boolean(check)
          const commitUrl =
            check?.commitSha && check?.filePath ? buildCommitFileUrl(check.commitSha, check.filePath) : null

          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  checked
                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {checked ? '완료' : '미완료'}
              </span>
              {isAdmin && checked && (
                <form action={adminRemoveCheck.bind(null, problem.id, member.id)}>
                  <button type="submit" className="text-xs text-red-600 dark:text-red-400">
                    취소
                  </button>
                </form>
              )}
              <span>{member.name}</span>
              {commitUrl && (
                <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  코드 보기
                </a>
              )}
              {!checked && <span className="text-xs text-gray-400">아직 제출 안됨</span>}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
