import { createProblem } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'

export function ProblemForm() {
  const defaultWeek = getMostRecentTuesday(new Date())

  return (
    <form action={createProblem} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="title" className="sr-only">
        문제명
      </label>
      <input id="title" name="title" placeholder="문제명" required className="rounded border px-3 py-2" />
      <label htmlFor="link" className="sr-only">
        문제 링크
      </label>
      <input
        id="link"
        name="link"
        type="url"
        placeholder="문제 링크"
        required
        className="rounded border px-3 py-2"
      />
      <label htmlFor="weekOf" className="sr-only">
        대상 주차
      </label>
      <input
        id="weekOf"
        name="weekOf"
        type="date"
        defaultValue={defaultWeek}
        required
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        문제 등록
      </button>
    </form>
  )
}
