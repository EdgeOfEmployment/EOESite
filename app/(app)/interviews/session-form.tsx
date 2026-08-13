import { createSession } from './actions'

export function SessionForm() {
  return (
    <form action={createSession} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="title" className="sr-only">
        세션 제목
      </label>
      <input id="title" name="title" placeholder="세션 제목" required className="rounded border px-3 py-2" />

      <label htmlFor="sessionAt">일시</label>
      <input
        id="sessionAt"
        name="sessionAt"
        type="datetime-local"
        required
        className="rounded border px-3 py-2"
      />

      <label htmlFor="description" className="sr-only">
        설명
      </label>
      <textarea
        id="description"
        name="description"
        placeholder="장소/링크 등 (선택)"
        className="rounded border px-3 py-2"
      />

      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        세션 만들기
      </button>
    </form>
  )
}
