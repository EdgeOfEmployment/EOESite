import type { CheckinComment, CheckinGoal, CheckinPost, CheckinReaction } from '@/lib/checkin/types'
import { computeLateFine, shiftKstDateString } from '@/lib/checkin/time'
import type { CodingCheck, CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import type { FlatFeedbackComment, JobPost, JobPostQuestion } from '@/lib/jobposts/types'
import { buildFeedbackLines } from '@/lib/jobposts/snapshot'
import type { InterviewQa, InterviewSession } from '@/lib/interviews/types'
import type { BankProblem } from '@/lib/problems/types'

/**
 * Everything /tour shows. Pure and deterministic: every date is derived from `today` (a KST
 * `YYYY-MM-DD`), so the demo always looks like a study group that is running right now, and a
 * test can pin `today` to any date. Nothing here is real member data.
 */

export const TOUR_ME_ID = 'tour-me'

/** Swap these for real desk photos by replacing the files and, if the extension changes, these paths. */
export const TOUR_DESK_PHOTOS = [
  '/tour/desk-1.svg',
  '/tour/desk-2.svg',
  '/tour/desk-3.svg',
  '/tour/desk-4.svg',
  '/tour/desk-5.svg',
  '/tour/desk-6.svg',
]

export const TOUR_FEED_DAYS = 14

export interface TourManualFine {
  id: string
  userId: string
  amount: number
  paid: boolean
  createdAt: string
}

export interface TourFeedbackDoc {
  id: string
  heading: string
  authorName: string
  /** Same shape `buildFeedbackLines` produces from the source post's questions. */
  lines: { questionIndex: number; question: string; text: string }[]
  comments: FlatFeedbackComment[]
}

export interface TourFixtures {
  today: string
  me: Member
  members: Member[]
  /** Newest first, covering today and the previous `TOUR_FEED_DAYS - 1` days. */
  checkinPosts: CheckinPost[]
  /** Late-fine posts whose fine has been paid. */
  paidPostIds: string[]
  manualFines: TourManualFine[]
  /** Newest first, like `getCodingWeeks()`; the first one contains `today`. */
  codingWeeks: CodingWeek[]
  codingProblems: Record<string, CodingProblem[]>
  jobPosts: JobPost[]
  interviewSessions: InterviewSession[]
  interviewQas: InterviewQa[]
  feedbackDocs: TourFeedbackDoc[]
  bankProblems: BankProblem[]
}

const MEMBERS: Member[] = [
  { id: TOUR_ME_ID, name: '나 (체험)' },
  { id: 'tour-haneul', name: '김하늘' },
  { id: 'tour-doyun', name: '이도윤' },
  { id: 'tour-seoyeon', name: '박서연' },
  { id: 'tour-jihoon', name: '최지훈' },
  { id: 'tour-yuna', name: '정유나' },
]

const nameOf = (id: string) => MEMBERS.find((m) => m.id === id)?.name ?? '알 수 없음'

/** KST wall-clock time on a KST date, as the UTC ISO string Supabase would return. */
function kstIso(date: string, hours: number, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hours - 9, minutes)).toISOString()
}

/** `timestamptz` as PostgREST serializes it (`+00:00`, not `Z`), which /interviews prints verbatim. */
function postgresTimestamp(iso: string): string {
  return iso.replace('.000Z', '+00:00')
}

// ---------------------------------------------------------------- check-ins

const GOAL_POOL = [
  '프로그래머스 2문제 풀기',
  'CS 운영체제 챕터 정리',
  '자소서 1번 문항 초안',
  '백준 그래프 문제 1개',
  '포트폴리오 README 다듬기',
  '면접 예상 질문 5개 답변 쓰기',
  'SQL 고득점 Kit 3문제',
  '기업 분석 1곳',
]

const COMMENT_POOL = ['오늘도 화이팅!', '책상 깔끔하네요 👍', '저도 그 문제 풀었어요', '내일도 10시 전에!']

// The post on day `d` (0 = today) by member index `m` is skipped on these slots, so the
// calendar and the dashboard show a realistic, not perfect, attendance record.
function skipsDay(d: number, m: number): boolean {
  if (d === 0) return m >= 4
  return (d + m) % 5 === 3
}

function isLateSlot(d: number, m: number): boolean {
  return d > 0 && m !== 0 && (d + m * 3) % 9 === 4
}

function buildGoals(date: string, d: number, m: number): CheckinGoal[] {
  if (d === 0 && m === 0) {
    return [
      { body: '프로그래머스 2문제 풀기', status: 'done', completedAt: kstIso(date, 11, 20) },
      { body: 'CS 운영체제 챕터 정리', status: 'partial', completedAt: null },
      { body: '토스 자소서 1번 문항 초안', status: 'todo', completedAt: null },
    ]
  }
  return [0, 1, 2].map((k) => {
    const body = GOAL_POOL[(d * 3 + m + k) % GOAL_POOL.length]
    // Past days are mostly finished; today is still in progress.
    const done = d > 0 ? (d + m + k) % 4 !== 0 : k === 0
    return done
      ? { body, status: 'done', completedAt: kstIso(date, 13 + k * 2, (m * 7) % 60) }
      : { body, status: d > 0 && k === 2 ? 'partial' : 'todo', completedAt: null }
  })
}

function buildCheckinPosts(today: string): { posts: CheckinPost[]; paidPostIds: string[] } {
  const posts: CheckinPost[] = []
  const paidPostIds: string[] = []

  for (let d = 0; d < TOUR_FEED_DAYS; d++) {
    const date = shiftKstDateString(today, -d)

    MEMBERS.forEach((member, m) => {
      if (skipsDay(d, m)) return

      const createdAt = isLateSlot(d, m)
        ? kstIso(date, 10, 1 + ((d + m) % 4) * 6)
        : kstIso(date, 9, 30 + ((d * 7 + m * 11) % 28))
      const { isLate, fineAmount } = computeLateFine(createdAt)
      const id = `tour-checkin-${date}-${m}`

      const reactions: CheckinReaction[] = [1, 2].map((offset) => {
        const reactor = MEMBERS[(m + offset) % MEMBERS.length]
        return { id: `${id}-r${offset}`, authorId: reactor.id, emoji: offset === 1 ? '👍' : '💪' }
      })

      const comments: CheckinComment[] =
        (d + m) % 4 === 0
          ? [
              {
                id: `${id}-c1`,
                authorId: MEMBERS[(m + 1) % MEMBERS.length].id,
                authorName: MEMBERS[(m + 1) % MEMBERS.length].name,
                body: COMMENT_POOL[(d + m) % COMMENT_POOL.length],
                createdAt: kstIso(date, 10, 30),
              },
            ]
          : []

      posts.push({
        id,
        authorId: member.id,
        authorName: member.name,
        photoUrl: TOUR_DESK_PHOTOS[(d + m) % TOUR_DESK_PHOTOS.length],
        goals: buildGoals(date, d, m),
        createdAt,
        isLate,
        fineAmount,
        comments,
        reactions,
      })

      if (isLate && d >= 7) paidPostIds.push(id)
    })
  }

  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { posts, paidPostIds }
}

// ---------------------------------------------------------------- coding

// Baekjoon problems, so every link in the demo opens a real, matching problem page.
const BOJ = (n: number) => `https://www.acmicpc.net/problem/${n}`

const WEEK_PROBLEMS: { title: string; number: number; assignees: string[] }[][] = [
  [
    { title: '미로 탐색', number: 2178, assignees: [] },
    { title: '평범한 배낭', number: 12865, assignees: [TOUR_ME_ID, 'tour-haneul', 'tour-doyun'] },
    { title: '최소비용 구하기', number: 1916, assignees: ['tour-seoyeon', 'tour-jihoon', 'tour-yuna'] },
  ],
  [
    { title: 'DFS와 BFS', number: 1260, assignees: [] },
    { title: '바이러스', number: 2606, assignees: [] },
  ],
  [
    { title: '회의실 배정', number: 1931, assignees: [] },
    { title: '1, 2, 3 더하기', number: 9095, assignees: [] },
  ],
]

/** Day of week of a `YYYY-MM-DD`, Monday = 0. */
function mondayOffset(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return (day + 6) % 7
}

function buildChecks(weekIndex: number, problemIndex: number, targets: string[]): CodingCheck[] {
  return targets.flatMap((userId, m): CodingCheck[] => {
    // This week: the demo member has solved the shared problem (auto-detected push) but not the
    // assigned one, so the dashboard widget shows one done and one to do.
    if (weekIndex === 0) {
      if (userId === TOUR_ME_ID) {
        return problemIndex === 0 ? [{ userId, commitSha: null, filePath: null, source: 'auto' }] : []
      }
      if ((m + problemIndex) % 3 === 0) return []
    }
    if (weekIndex > 0 && (m + problemIndex + weekIndex) % 6 === 5) return []
    const source = (m + problemIndex) % 4 === 1 ? 'manual' : 'auto'
    return [{ userId, commitSha: null, filePath: null, source }]
  })
}

function buildCoding(today: string): { weeks: CodingWeek[]; problems: Record<string, CodingProblem[]> } {
  const currentMonday = shiftKstDateString(today, -mondayOffset(today))
  const weeks: CodingWeek[] = []
  const problems: Record<string, CodingProblem[]> = {}

  WEEK_PROBLEMS.forEach((weekProblems, weekIndex) => {
    const startDate = shiftKstDateString(currentMonday, -7 * weekIndex)
    const weekNumber = 12 - weekIndex
    const week: CodingWeek = {
      id: `tour-week-${weekNumber}`,
      label: `${weekNumber}주차`,
      startDate,
      endDate: shiftKstDateString(startDate, 6),
    }
    weeks.push(week)
    problems[week.id] = weekProblems.map((p, problemIndex) => {
      const targets = p.assignees.length > 0 ? p.assignees : MEMBERS.map((member) => member.id)
      return {
        id: `${week.id}-p${problemIndex}`,
        title: p.title,
        link: BOJ(p.number),
        createdBy: 'tour-haneul',
        createdAt: kstIso(startDate, 9, problemIndex),
        assigneeIds: p.assignees,
        checks: buildChecks(weekIndex, problemIndex, targets),
      }
    })
  })

  return { weeks, problems }
}

// ---------------------------------------------------------------- job posts & feedback

const TOSS_QUESTIONS: JobPostQuestion[] = [
  {
    question: '지원 동기와 입사 후 이루고 싶은 목표를 작성해주세요.',
    answer:
      '스터디원 10명이 매일 쓰는 출석 사이트를 직접 만들고 운영하며, 사용자가 매일 돌아오게 만드는 작은 디테일의 힘을 배웠습니다. 결제처럼 실수가 허용되지 않는 영역에서 그 디테일을 끝까지 책임지는 개발자가 되고 싶어 지원했습니다.\n입사 후에는 장애 없이 배포하는 문화에 기여하는 것이 첫 목표입니다.',
  },
  {
    question: '가장 어려웠던 기술적 문제와 해결 과정을 작성해주세요.',
    answer:
      '캐시를 도입한 뒤 다른 멤버의 인증 글이 늦게 보이는 문제가 생겼습니다. 프레임워크 내부 코드를 읽어 경로 단위 무효화가 다른 캐시까지 지운다는 사실을 찾았습니다. 태그 단위 무효화로 바꾸고 회귀 테스트를 추가해 해결했습니다.',
  },
]

function buildJobPosts(today: string): { jobPosts: JobPost[]; feedbackDocs: TourFeedbackDoc[] } {
  const specs: { authorId: string; days: number; company: string; info: string; questions: JobPostQuestion[]; feedbackDocId: string | null }[] = [
    { authorId: TOUR_ME_ID, days: 0, company: '토스', info: '서버 개발자 (신입) · 서류 마감 D-5', questions: TOSS_QUESTIONS, feedbackDocId: 'tour-feedback-toss' },
    {
      authorId: 'tour-haneul',
      days: 1,
      company: '카카오',
      info: '2026 하반기 신입 공채 · 백엔드',
      questions: [{ question: '협업 과정에서 갈등을 해결한 경험을 작성해주세요.', answer: '팀 프로젝트에서 API 명세를 두고 의견이 갈렸을 때, 각자 안의 장단점을 표로 정리해 회의 시간을 절반으로 줄였습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-seoyeon',
      days: 2,
      company: '네이버',
      info: 'FE 신입 · 코딩테스트 포함',
      questions: [{ question: '본인의 강점을 작성해주세요.', answer: '모르는 것을 빠르게 인정하고, 공식 문서부터 읽는 습관이 있습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-doyun',
      days: 4,
      company: '당근',
      info: '백엔드 엔지니어 (주니어)',
      questions: [{ question: '최근 몰입했던 경험을 작성해주세요.', answer: '오픈소스 라이브러리의 버그를 재현하고 고치는 PR을 올려 머지되기까지 2주 동안 몰입했습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-yuna',
      days: 6,
      company: '우아한형제들',
      info: '서버 신입 · 상시 채용',
      questions: [{ question: '지원 직무와 관련된 경험을 작성해주세요.', answer: '배달 주문 흐름을 흉내 낸 토이 프로젝트에서 동시 주문 시 재고가 음수가 되는 문제를 락으로 해결했습니다.' }],
      feedbackDocId: null,
    },
  ]

  const jobPosts: JobPost[] = specs.map((spec, index) => {
    const postDate = shiftKstDateString(today, -spec.days)
    return {
      id: `tour-jobpost-${index}`,
      authorId: spec.authorId,
      authorName: nameOf(spec.authorId),
      postDate,
      companyName: spec.company,
      postingInfo: spec.info,
      questions: spec.questions,
      feedbackRequested: spec.feedbackDocId !== null,
      feedbackDocId: spec.feedbackDocId,
      createdAt: kstIso(postDate, 21, 10 + index),
      reactions: [
        { id: `tour-jobpost-${index}-r1`, authorId: MEMBERS[(index + 1) % MEMBERS.length].id, emoji: '🎉' },
        { id: `tour-jobpost-${index}-r2`, authorId: MEMBERS[(index + 2) % MEMBERS.length].id, emoji: '👍' },
      ],
    }
  })

  const feedbackDocs: TourFeedbackDoc[] = [
    {
      id: 'tour-feedback-toss',
      heading: '토스 자소서 피드백',
      authorName: nameOf(TOUR_ME_ID),
      lines: buildFeedbackLines(TOSS_QUESTIONS),
      comments: [
        { id: 'tour-fc-1', lineIndex: 0, parentCommentId: null, authorId: 'tour-haneul', authorName: '김하늘', body: '숫자(10명)가 들어가서 구체적이에요. 좋아요!', createdAt: kstIso(today, 22, 0) },
        { id: 'tour-fc-2', lineIndex: 0, parentCommentId: 'tour-fc-1', authorId: TOUR_ME_ID, authorName: nameOf(TOUR_ME_ID), body: '감사합니다 🙏', createdAt: kstIso(today, 22, 10) },
        { id: 'tour-fc-3', lineIndex: 4, parentCommentId: null, authorId: 'tour-doyun', authorName: '이도윤', body: '"프레임워크 내부 코드를 읽어"를 더 구체적으로 쓰면 강점이 살 것 같아요.', createdAt: kstIso(today, 22, 30) },
      ],
    },
  ]

  return { jobPosts, feedbackDocs }
}

// ---------------------------------------------------------------- interviews

function buildInterviews(today: string): { sessions: InterviewSession[]; qas: InterviewQa[]; feedbackDocs: TourFeedbackDoc[] } {
  const pastDate = shiftKstDateString(today, -4)
  const nextDate = shiftKstDateString(today, 3)
  const pastTitle = '기술면접 스터디 (네트워크·DB)'

  const sessions: InterviewSession[] = [
    {
      id: 'tour-interview-1',
      createdBy: 'tour-haneul',
      title: pastTitle,
      sessionAt: postgresTimestamp(kstIso(pastDate, 20, 0)),
      description: 'Zoom · 1인당 질문 3개, 답변 5분',
      createdAt: kstIso(shiftKstDateString(pastDate, -3), 12, 0),
      participants: [TOUR_ME_ID, 'tour-haneul', 'tour-doyun', 'tour-seoyeon'].map((userId) => ({ userId, userName: nameOf(userId) })),
    },
    {
      id: 'tour-interview-2',
      createdBy: 'tour-jihoon',
      title: '인성면접 + 자소서 꼬리질문',
      sessionAt: postgresTimestamp(kstIso(nextDate, 20, 0)),
      description: '각자 최신 자소서 1개 준비해오기',
      createdAt: kstIso(today, 9, 0),
      participants: ['tour-haneul', 'tour-jihoon'].map((userId) => ({ userId, userName: nameOf(userId) })),
    },
  ]

  const meQuestions = [
    { question: 'TCP와 UDP의 차이를 설명해주세요.', answer: 'TCP는 연결을 맺고 순서와 재전송을 보장합니다. UDP는 연결 없이 보내 빠르지만 손실을 감수합니다.' },
    { question: '인덱스가 항상 빠른가요?', answer: '아닙니다. 선택도가 낮거나 쓰기가 많은 테이블에서는 오히려 느려질 수 있습니다.' },
  ]
  const doyunQuestions = [{ question: 'HTTP 1.1과 2의 차이는?', answer: '2는 하나의 연결에서 여러 요청을 동시에 보내는 멀티플렉싱을 지원합니다.' }]

  const qas: InterviewQa[] = [
    { id: 'tour-qa-me', sessionId: 'tour-interview-1', authorId: TOUR_ME_ID, authorName: nameOf(TOUR_ME_ID), questions: meQuestions, feedbackDocId: 'tour-feedback-qa-me', createdAt: kstIso(pastDate, 21, 30) },
    { id: 'tour-qa-doyun', sessionId: 'tour-interview-1', authorId: 'tour-doyun', authorName: '이도윤', questions: doyunQuestions, feedbackDocId: 'tour-feedback-qa-doyun', createdAt: kstIso(pastDate, 21, 40) },
  ]

  const feedbackDocs: TourFeedbackDoc[] = [
    {
      id: 'tour-feedback-qa-me',
      heading: `${pastTitle} 피드백`,
      authorName: nameOf(TOUR_ME_ID),
      lines: buildFeedbackLines(meQuestions),
      comments: [
        { id: 'tour-fc-qa-1', lineIndex: 0, parentCommentId: null, authorId: 'tour-seoyeon', authorName: '박서연', body: '흐름 제어·혼잡 제어도 한 줄 덧붙이면 좋겠어요.', createdAt: kstIso(pastDate, 22, 0) },
      ],
    },
    {
      id: 'tour-feedback-qa-doyun',
      heading: `${pastTitle} 피드백`,
      authorName: '이도윤',
      lines: buildFeedbackLines(doyunQuestions),
      comments: [],
    },
  ]

  return { sessions, qas, feedbackDocs }
}

// ---------------------------------------------------------------- problem bank

function buildBankProblems(today: string): BankProblem[] {
  const created = (days: number) => kstIso(shiftKstDateString(today, -days), 23, 0)
  return [
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a01',
      createdBy: 'tour-haneul',
      authorName: '김하늘',
      createdAt: created(9),
      updatedAt: created(9),
      company: '카카오',
      title: '두 배열의 교집합 크기',
      descriptionMd: '정수 배열 `a`와 `b`가 주어집니다. 두 배열에 **모두** 등장하는 서로 다른 값의 개수를 반환하세요.',
      constraintsMd: '- 1 ≤ 배열 길이 ≤ 100,000\n- 배열 안의 값은 중복될 수 있습니다.',
      timeLimitMs: 1000,
      signature: { params: [{ name: 'a', type: 'int[]' }, { name: 'b', type: 'int[]' }], returnType: 'int' },
      testCases: [
        { args: [[1, 2, 3], [2, 3, 4]], expected: 2, isExample: true },
        { args: [[1, 1, 1], [1]], expected: 1, isExample: true },
        { args: [[5], [6]], expected: 0, isExample: false },
      ],
    },
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a02',
      createdBy: 'tour-seoyeon',
      authorName: '박서연',
      createdAt: created(5),
      updatedAt: created(3),
      company: '네이버',
      title: '올바른 괄호 문자열',
      descriptionMd: '`(`, `)`, `[`, `]`로만 이루어진 문자열 `s`가 올바른 괄호 문자열이면 `true`를 반환하세요.',
      constraintsMd: '- 1 ≤ s의 길이 ≤ 10,000',
      timeLimitMs: 1000,
      signature: { params: [{ name: 's', type: 'string' }], returnType: 'bool' },
      testCases: [
        { args: ['([])'], expected: true, isExample: true },
        { args: ['(]'], expected: false, isExample: true },
        { args: ['(('], expected: false, isExample: false },
      ],
    },
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a03',
      createdBy: 'tour-doyun',
      authorName: '이도윤',
      createdAt: created(2),
      updatedAt: created(2),
      company: '토스',
      title: '길이 k 구간 합의 최댓값',
      descriptionMd: '정수 배열 `nums`에서 연속한 `k`개 원소의 합 중 최댓값을 반환하세요.',
      constraintsMd: '- 1 ≤ k ≤ nums의 길이 ≤ 100,000\n- 합은 32비트 정수 범위를 넘을 수 있습니다.',
      timeLimitMs: 2000,
      signature: { params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'long' },
      testCases: [
        { args: [[1, 2, 3, 4, 5], 2], expected: 9, isExample: true },
        { args: [[2147483647, 2147483647], 2], expected: 4294967294, isExample: true },
        { args: [[-1, -2, -3], 1], expected: -1, isExample: false },
      ],
    },
  ]
}

// ---------------------------------------------------------------- entry point

export function buildTourFixtures(today: string): TourFixtures {
  const { posts, paidPostIds } = buildCheckinPosts(today)
  const { weeks, problems } = buildCoding(today)
  const jobs = buildJobPosts(today)
  const interviews = buildInterviews(today)

  return {
    today,
    me: MEMBERS[0],
    members: MEMBERS,
    checkinPosts: posts,
    paidPostIds,
    manualFines: [{ id: 'tour-manual-fine-1', userId: 'tour-jihoon', amount: 5000, paid: false, createdAt: kstIso(today, 9, 0) }],
    codingWeeks: weeks,
    codingProblems: problems,
    jobPosts: jobs.jobPosts,
    interviewSessions: interviews.sessions,
    interviewQas: interviews.qas,
    feedbackDocs: [...jobs.feedbackDocs, ...interviews.feedbackDocs],
    bankProblems: buildBankProblems(today),
  }
}
