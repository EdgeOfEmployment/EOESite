import { describe, it, expect } from 'vitest'
import { buildFeedbackLines } from './snapshot'

describe('buildFeedbackLines', () => {
  it('returns a single-element array for text with no line breaks', () => {
    expect(buildFeedbackLines('한 줄짜리 자소서')).toEqual(['한 줄짜리 자소서'])
  })

  it('splits text on newlines into one entry per line', () => {
    const text = '첫 번째 줄\n두 번째 줄\n세 번째 줄'
    expect(buildFeedbackLines(text)).toEqual(['첫 번째 줄', '두 번째 줄', '세 번째 줄'])
  })

  it('preserves blank lines between paragraphs', () => {
    const text = '첫 문단\n\n둘째 문단'
    expect(buildFeedbackLines(text)).toEqual(['첫 문단', '', '둘째 문단'])
  })

  it('normalizes CRLF line endings', () => {
    const text = '줄1\r\n줄2'
    expect(buildFeedbackLines(text)).toEqual(['줄1', '줄2'])
  })
})
