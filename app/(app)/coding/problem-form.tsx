import { createProblem } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProblemForm() {
  const defaultWeek = getMostRecentTuesday(new Date())

  return (
    <Card as="form" action={createProblem} className="flex flex-col gap-3">
      <Label htmlFor="title" className="sr-only">
        문제명
      </Label>
      <Input id="title" name="title" placeholder="문제명" required />
      <Label htmlFor="link" className="sr-only">
        문제 링크
      </Label>
      <Input id="link" name="link" type="url" placeholder="문제 링크" required />
      <Label htmlFor="weekOf" className="sr-only">
        대상 주차
      </Label>
      <Input id="weekOf" name="weekOf" type="date" defaultValue={defaultWeek} required />
      <Label htmlFor="matchKeyword" className="sr-only">
        저장소 매칭 키워드 (선택)
      </Label>
      <Input
        id="matchKeyword"
        name="matchKeyword"
        placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)"
      />
      <Button type="submit" className="self-start">
        문제 등록
      </Button>
    </Card>
  )
}
