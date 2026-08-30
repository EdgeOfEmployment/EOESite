'use client'

import { useState } from 'react'
import { createInterviewQa } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface QuestionField {
  question: string
  answer: string
}

export function QaForm({ sessionId }: { sessionId: string }) {
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
    <Card as="form" action={createInterviewQa.bind(null, sessionId)} className="flex flex-col gap-3">
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
              placeholder="받은 질문"
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
              placeholder="내 답변"
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

      <Button type="submit" size="lg" className="self-start">
        등록
      </Button>
    </Card>
  )
}
