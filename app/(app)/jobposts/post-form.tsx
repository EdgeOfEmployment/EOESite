import { createJobPost } from './actions'

export function PostForm() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={createJobPost} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="companyName" className="sr-only">
        회사명
      </label>
      <input
        id="companyName"
        name="companyName"
        placeholder="회사명"
        required
        className="rounded border px-3 py-2"
      />
      <label htmlFor="postingInfo" className="sr-only">
        공고 정보
      </label>
      <textarea
        id="postingInfo"
        name="postingInfo"
        placeholder="공고 링크/정보 (선택)"
        className="rounded border px-3 py-2"
      />
      <label htmlFor="coverLetterText" className="sr-only">
        자소서 원문
      </label>
      <textarea
        id="coverLetterText"
        name="coverLetterText"
        placeholder="자소서 원문"
        required
        rows={6}
        className="rounded border px-3 py-2"
      />
      <label htmlFor="postDate" className="sr-only">
        날짜
      </label>
      <input
        id="postDate"
        name="postDate"
        type="date"
        defaultValue={today}
        required
        className="rounded border px-3 py-2"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="feedbackRequested" />
        피드백 받고 싶어요
      </label>
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        등록
      </button>
    </form>
  )
}
