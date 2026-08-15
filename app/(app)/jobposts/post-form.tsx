'use client'

import { useState } from 'react'
import { createJobPost } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface QuestionField {
  question: string
  answer: string
}

export function PostForm() {
  const today = new Date().toISOString().slice(0, 10)
  const [questions, setQuestions] = useState<QuestionField[]>([{ question: '', answer: '' }])

  function addQuestion() {
    setQuestions((prev) => [...prev, { question: '', answer: '' }])
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  function updateQuestion(index: number, field: keyof QuestionField, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)))
  }

  return (
    <Card as="form" action={createJobPost} className="flex flex-col gap-3">
      <Label htmlFor="companyName" className="sr-only">
        회사명
      </Label>
      <Input id="companyName" name="companyName" placeholder="회사명" required />
      <Label htmlFor="postingInfo" className="sr-only">
        공고 정보
      </Label>
      <Textarea id="postingInfo" name="postingInfo" placeholder="공고 링크/정보 (선택)" />

      <input type="hidden" name="questionCount" value={questions.length} />

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <Card key={index} padding="sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">문항 {index + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  삭제
                </button>
              )}
            </div>
            <Label htmlFor={`question-${index}`} className="sr-only">
              질문
            </Label>
            <Input
              id={`question-${index}`}
              name={`question-${index}`}
              placeholder="질문 (예: 지원동기를 작성해주세요)"
              required
              value={q.question}
              onChange={(e) => updateQuestion(index, 'question', e.target.value)}
              className="mb-2"
            />
            <Label htmlFor={`answer-${index}`} className="sr-only">
              답변
            </Label>
            <Textarea
              id={`answer-${index}`}
              name={`answer-${index}`}
              placeholder="답변"
              required
              rows={5}
              value={q.answer}
              onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
            />
          </Card>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addQuestion} className="self-start">
        + 문항 추가
      </Button>

      <Label htmlFor="postDate" className="sr-only">
        날짜
      </Label>
      <Input id="postDate" name="postDate" type="date" defaultValue={today} required />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="feedbackRequested" />
        피드백 받고 싶어요
      </label>
      <Button type="submit" className="self-start">
        등록
      </Button>
    </Card>
  )
}
