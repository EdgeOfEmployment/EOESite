import { createCheckinPost } from './actions'
import { CHECKIN_TYPE_LABELS } from '@/lib/checkin/types'

export function PostForm() {
  return (
    <form action={createCheckinPost} className="flex flex-col gap-3 rounded border p-4">
      <select name="type" required defaultValue="" className="rounded border px-3 py-2">
        <option value="" disabled>
          인증 종류 선택
        </option>
        {Object.entries(CHECKIN_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        name="body"
        placeholder="오늘의 인증 내용을 남겨주세요"
        required
        className="rounded border px-3 py-2"
      />
      <input type="file" name="photo" accept="image/*" className="text-sm" />
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        인증하기
      </button>
    </form>
  )
}
