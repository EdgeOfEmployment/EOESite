import { describe, it, expect } from 'vitest'
import { buildFeedbackLines } from './snapshot'

describe('buildFeedbackLines', () => {
  it('splits a single answer into sentences ending at each period', () => {
    const result = buildFeedbackLines([
      { question: '지원동기를 작성해주세요', answer: '첫 번째 문장입니다. 두 번째 문장입니다.' },
    ])

    expect(result).toEqual([
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
    ])
  })

  it('splits on newlines even without a trailing period', () => {
    const result = buildFeedbackLines([{ question: '강점은 무엇인가요', answer: '첫 줄\n둘째 줄' }])

    expect(result.map((l) => l.text)).toEqual(['첫 줄', '둘째 줄'])
  })

  it('does not produce a blank line when a period is immediately followed by a newline', () => {
    const result = buildFeedbackLines([{ question: '강점은 무엇인가요', answer: '문장1.\n문장2.' }])

    expect(result.map((l) => l.text)).toEqual(['문장1.', '문장2.'])
  })

  it('tags every line with the question index and text it came from', () => {
    const result = buildFeedbackLines([
      { question: '지원동기', answer: '첫 문장.' },
      { question: '강점', answer: '둘째 문장.' },
    ])

    expect(result).toEqual([
      { questionIndex: 0, question: '지원동기', text: '첫 문장.' },
      { questionIndex: 1, question: '강점', text: '둘째 문장.' },
    ])
  })

  it('skips a question with an empty answer', () => {
    const result = buildFeedbackLines([
      { question: '지원동기', answer: '' },
      { question: '강점', answer: '둘째 문장.' },
    ])

    expect(result).toEqual([{ questionIndex: 1, question: '강점', text: '둘째 문장.' }])
  })
})
