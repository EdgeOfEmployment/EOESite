import { createSession } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SessionForm() {
  return (
    <Card as="form" action={createSession} className="flex flex-col gap-3">
      <Label htmlFor="title" className="sr-only">
        세션 제목
      </Label>
      <Input id="title" name="title" placeholder="세션 제목" required />

      <Label htmlFor="sessionAt">일시</Label>
      <Input id="sessionAt" name="sessionAt" type="datetime-local" required />

      <Label htmlFor="description" className="sr-only">
        설명
      </Label>
      <Textarea id="description" name="description" placeholder="장소/링크 등 (선택)" />

      <Button type="submit" size="lg" className="self-start">
        세션 만들기
      </Button>
    </Card>
  )
}
