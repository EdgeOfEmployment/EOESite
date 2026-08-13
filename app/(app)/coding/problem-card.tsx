import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem } from './actions'

export function ProblemCard({
  problem,
  members,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  isAdmin: boolean
}) {
  return (
    <div className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <a
          href={problem.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          {problem.title}
        </a>
        {isAdmin && (
          <form action={deleteProblem.bind(null, problem.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {members.map((member) => {
          const checked = problem.checkedUserIds.includes(member.id)
          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-gray-200' : ''}`}>
                {checked ? '완료' : '미완료'}
              </span>
              {isAdmin && checked && (
                <form action={adminRemoveCheck.bind(null, problem.id, member.id)}>
                  <button type="submit" className="text-xs text-red-600">
                    취소
                  </button>
                </form>
              )}
              <span>{member.name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
