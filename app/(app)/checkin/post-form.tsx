import { createCheckinPost } from './actions'
import { CHECKIN_TYPE_LABELS } from '@/lib/checkin/types'
import { Card } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PostForm() {
  return (
    <Card as="form" action={createCheckinPost} className="flex flex-col gap-3">
      <Select name="type" required defaultValue="">
        <option value="" disabled>
          인증 종류 선택
        </option>
        {Object.entries(CHECKIN_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Textarea name="body" placeholder="오늘의 인증 내용을 남겨주세요" required />
      <input type="file" name="photo" accept="image/*" className="text-sm" />
      <Button type="submit" className="self-start">
        인증하기
      </Button>
    </Card>
  )
}
