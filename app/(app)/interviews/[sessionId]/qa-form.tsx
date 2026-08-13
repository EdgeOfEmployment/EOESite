'use client'

import { useState } from 'react'
import { createInterviewQa } from './actions'

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
    <form action={createInterviewQa.bind(null, sessionId)} className="flex flex-col gap-3 rounded border p-4">
      <input type="hidden" name="questionCount" value={questions.length} />

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <div key={index} className="rounded border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">문항 {index + 1}</span>
              {questions.length > 1 && (
                <button type="button" onClick={() => removeQuestion(index)} className="text-xs text-red-600">
                  삭제
                </button>
              )}
            </div>
            <label htmlFor={`question-${index}`} className="sr-only">
              질문
            </label>
            <input
              id={`question-${index}`}
              name={`question-${index}`}
              placeholder="받은 질문"
              required
              value={q.question}
              onChange={(e) => updateQuestion(index, 'question', e.target.value)}
              className="mb-2 w-full rounded border px-3 py-2"
            />
            <label htmlFor={`answer-${index}`} className="sr-only">
              답변
            </label>
            <textarea
              id={`answer-${index}`}
              name={`answer-${index}`}
              placeholder="내 답변"
              required
              rows={5}
              value={q.answer}
              onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="self-start rounded border px-3 py-1 text-sm">
        + 문항 추가
      </button>

      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        등록
      </button>
    </form>
  )
}
