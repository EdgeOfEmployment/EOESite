import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getKstDateString, shiftKstDateString } from '@/lib/checkin/time'
import { validateProblem } from '@/lib/problems/validate'
import { generate, LANGUAGES } from '@/lib/problems/generate'
import { buildTourFixtures, TOUR_DESK_PHOTOS, TOUR_FEED_DAYS, TOUR_ME_ID } from './fixtures'
import {
  checkinCalendarPosts,
  checkinPostsOn,
  codingWidget,
  feedbackPage,
  jobPostCalendarPosts,
  monthFines,
  problemSummaries,
  sessionQaGroups,
  todaysAuthorIds,
} from './selectors'

// Month/year boundaries, a leap day, and a Sunday and a Monday (the coding week starts Monday).
const DATES = ['2026-10-25', '2026-10-26', '2026-03-01', '2024-02-29', '2026-12-31', '2027-01-01']

describe.each(DATES)('buildTourFixtures(%s)', (today) => {
  const fx = buildTourFixtures(today)

  it('is deterministic', () => {
    expect(buildTourFixtures(today)).toEqual(fx)
  })

  it('keeps every check-in inside the feed window, newest first, with unique ids', () => {
    const earliest = shiftKstDateString(today, -(TOUR_FEED_DAYS - 1))
    for (const post of fx.checkinPosts) {
      const date = getKstDateString(post.createdAt)
      expect(date >= earliest && date <= today).toBe(true)
    }
    const times = fx.checkinPosts.map((p) => p.createdAt)
    expect(times).toEqual([...times].sort().reverse())
    expect(new Set(fx.checkinPosts.map((p) => p.id)).size).toBe(fx.checkinPosts.length)
  })

  it('has the demo member checked in on time today, and someone still missing', () => {
    const mine = checkinPostsOn(fx, today).find((p) => p.authorId === TOUR_ME_ID)
    expect(mine?.isLate).toBe(false)
    expect(todaysAuthorIds(fx).length).toBeLessThan(fx.members.length)
  })

  it('puts today inside the newest coding week, with contiguous Monday-start weeks', () => {
    const [current, ...older] = fx.codingWeeks
    expect(current.startDate <= today && today <= current.endDate).toBe(true)
    expect(new Date(`${current.startDate}T00:00:00Z`).getUTCDay()).toBe(1)
    older.forEach((week, i) => {
      const newer = fx.codingWeeks[i]
      expect(week.endDate).toBe(shiftKstDateString(newer.startDate, -1))
    })
  })

  it('shows the demo member one solved and one open problem on the dashboard widget', () => {
    const widget = codingWidget(fx)
    expect(widget.status).toBe('assigned')
    expect(widget.items.map((item) => item.completed).sort()).toEqual([false, true])
  })

  it('always has a fine this month, even on the first day of a month', () => {
    expect(monthFines(fx).reduce((sum, f) => sum + f.fineAmount, 0)).toBeGreaterThan(0)
  })

  it('dates job posts no later than today and has one interview still to come', () => {
    expect(fx.jobPosts.every((p) => p.postDate <= today)).toBe(true)
    expect(fx.interviewSessions.some((s) => getKstDateString(s.sessionAt) > today)).toBe(true)
  })

  it('resolves every feedback link to a page whose comments point at existing lines', () => {
    const ids = [
      ...fx.jobPosts.flatMap((p) => (p.feedbackDocId ? [p.feedbackDocId] : [])),
      ...fx.interviewQas.map((qa) => qa.feedbackDocId),
    ]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(feedbackPage(fx, id)).not.toBeNull()
    }
    for (const doc of fx.feedbackDocs) {
      for (const comment of doc.comments) {
        expect(comment.lineIndex).toBeLessThan(doc.lines.length)
      }
    }
  })

  it('shows this month in the check-in calendar', () => {
    const [year, month] = today.split('-').map(Number)
    expect(checkinCalendarPosts(fx, year, month).length).toBeGreaterThan(0)
    expect(jobPostCalendarPosts(fx, year, month).length).toBeGreaterThan(0)
  })
})

describe('tour bank problems', () => {
  const fx = buildTourFixtures('2026-10-25')

  it.each(fx.bankProblems.map((p) => [p.title, p] as const))('%s passes the real problem validation', (_title, problem) => {
    expect(validateProblem(problem)).toMatchObject({ ok: true })
  })

  it.each(fx.bankProblems.map((p) => [p.title, p] as const))('%s generates a file in every language', (_title, problem) => {
    for (const language of LANGUAGES) {
      const file = generate(problem, language.id, { problemUrl: 'https://example.test/tour/problems/x' })
      expect(file.content.length).toBeGreaterThan(0)
    }
  })

  it('lists summaries newest first', () => {
    const dates = problemSummaries(fx).map((p) => p.createdAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})

describe('tour desk photos', () => {
  it('points every photo path at a file under public/', () => {
    for (const photo of TOUR_DESK_PHOTOS) {
      expect(existsSync(path.join(process.cwd(), 'public', photo))).toBe(true)
    }
  })
})

describe('tour selectors', () => {
  const fx = buildTourFixtures('2026-10-25')

  it('returns null for an unknown feedback id', () => {
    expect(feedbackPage(fx, 'nope')).toBeNull()
  })

  it('groups a session’s Q&As by author', () => {
    const groups = sessionQaGroups(fx, 'tour-interview-1')
    expect(groups.map((g) => g.authorName).sort()).toEqual(['나 (체험)', '이도윤'].sort())
    expect(sessionQaGroups(fx, 'tour-interview-2')).toEqual([])
  })
})
