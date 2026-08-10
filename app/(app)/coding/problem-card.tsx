import type { CodingProblem, Member } from '@/lib/coding/types'
import { toggleCheck, deleteProblem } from './actions'

export function ProblemCard({
  problem,
  members,
  currentUserId,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  currentUserId: string
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
          const isSelf = member.id === currentUserId
          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              {isSelf ? (
                <form action={toggleCheck.bind(null, problem.id)}>
                  <button
                    type="submit"
                    aria-pressed={checked}
                    className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-black text-white' : ''}`}
                  >
                    {checked ? '완료' : '체크'}
                  </button>
                </form>
              ) : (
                <span className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-gray-200' : ''}`}>
                  {checked ? '완료' : '미완료'}
                </span>
              )}
              <span>{member.name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
