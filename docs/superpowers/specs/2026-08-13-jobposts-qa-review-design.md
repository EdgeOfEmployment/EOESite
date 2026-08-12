# 자소서 문항 구조화 + 문장 단위 GitHub PR 리뷰 스타일 설계

## 배경

기존 자소서 게시판(`/jobposts`, `/feedback/[id]`)은 자소서 전체를 하나의 텍스트 블록(`cover_letter_text`)으로 저장하고, 줄바꿈 문자로만 나눠 피드백 줄을 만들었다. 사용자 피드백 세 가지를 반영해 다음을 바꾼다:

1. 줄 단위 분리가 실제 문장 단위로 자연스럽게 되도록 (마침표 기준)
2. 자소서 등록 시 질문(문항)과 답변을 구분해서 입력
3. 피드백 화면에서 댓글을 달 때 GitHub PR 리뷰처럼 그 줄 아래로 칸이 벌어지는 인터랙션

세 가지가 서로 얽혀 있어(문항 구조가 바뀌면 줄 분리 입력도 바뀌고, 줄 분리 결과가 바뀌면 화면 렌더링도 바뀜) 하나의 설계로 묶는다.

## 데이터 모델 변경

### `job_posts` (마이그레이션 `0006_jobposts_qa.sql`)

`cover_letter_text text not null` 컬럼을 제거하고 `questions jsonb not null` 컬럼으로 대체한다.

```sql
alter table job_posts add column questions jsonb not null default '[]'::jsonb;
alter table job_posts drop column cover_letter_text;
alter table job_posts alter column questions drop default;
```

`questions`의 구조:

```json
[
  { "question": "지원동기를 작성해주세요", "answer": "저는 어릴 때부터..." },
  { "question": "본인의 강점은 무엇인가요", "answer": "저는 문제 해결 능력이..." }
]
```

**주의:** 기존에 만들어진 테스트 게시글이 있다면 `cover_letter_text` 내용은 이 마이그레이션으로 사라진다. 실사용 데이터가 아직 없다는 전제로 데이터 보존 로직은 넣지 않는다.

### `feedback_docs.lines` (스키마 변경 없음, 내용 구조만 변경)

컬럼 타입은 그대로 `jsonb`이지만 저장하는 배열의 원소가 문자열(`string`)에서 객체로 바뀐다:

```json
[
  { "questionIndex": 0, "question": "지원동기를 작성해주세요", "text": "저는 어릴 때부터 문제를 해결하는 과정에 흥미를 느꼈습니다." },
  { "questionIndex": 0, "question": "지원동기를 작성해주세요", "text": "그래서 컴퓨터공학을 전공했습니다." },
  { "questionIndex": 1, "question": "본인의 강점은 무엇인가요", "text": "저는 문제 해결 능력이 뛰어납니다." }
]
```

`feedback_comments.line_index`는 지금처럼 이 배열의 인덱스를 그대로 가리킨다 — 문항이 여러 개여도 전체를 이어붙인 하나의 평평한 배열이므로 `feedback_comments` 테이블 스키마는 바꾸지 않는다.

## 문장 분리 로직 변경 (`lib/jobposts/snapshot.ts`)

`buildFeedbackLines`의 시그니처를 문자열 하나가 아니라 문항 배열을 받도록 바꾼다:

```ts
export interface FeedbackLine {
  questionIndex: number
  question: string
  text: string
}

export function buildFeedbackLines(
  questions: { question: string; answer: string }[]
): FeedbackLine[]
```

각 답변을 **마침표(`.`) 또는 줄바꿈, 둘 중 먼저 나오는 문자를 기준으로** 문장 단위로 나눈다. 마침표는 문장 끝에 포함해서 보여주고, 각 조각은 앞뒤 공백을 trim한다. **빈 조각(연속된 마침표/줄바꿈으로 생기는 빈 문자열)은 결과에 포함하지 않는다** — 예를 들어 "문장1.\n문장2."처럼 마침표 뒤에 바로 줄바꿈이 오는 흔한 경우에도 빈 줄이 끼어들지 않고 "문장1.", "문장2." 두 개만 남는다. (기존에 "문단 사이 빈 줄 보존" 동작이 있었지만, 이제는 문항으로 이미 구획이 나뉘므로 빈 줄 보존은 더 이상 필요하지 않다고 판단했다.)

문항이 여러 개면 각 문항의 답변을 순서대로 문장 분리한 뒤 하나의 평평한 배열로 이어붙이고, 각 줄에 `questionIndex`/`question`을 붙인다.

**알려진 한계 (범위 밖):** "3.5개월", "e.g." 같은 마침표를 포함한 약어/소수점은 문장 경계로 오인되어 쪼개질 수 있다. 자소서 문장에서 흔한 케이스가 아니라고 보고, 이번 범위에서는 별도 처리하지 않는다.

## 등록 폼 (`app/(app)/jobposts/post-form.tsx`)

서버 컴포넌트에서 **클라이언트 컴포넌트**(`'use client'`)로 바뀐다. 문항을 최소 1개, 자유롭게 추가/삭제할 수 있는 배열 상태를 관리하고, 각 문항은 `question-{index}` / `answer-{index}`라는 이름의 입력 필드로 렌더링한다. 제출 시 `questionCount`라는 hidden input으로 총 개수를 함께 보내, 서버 액션이 `formData.get('question-0')`, `formData.get('answer-0')` ... 식으로 순서대로 읽어 배열을 복원한다. (JSON 직렬화 대신 인덱스 기반 필드를 쓰는 이유: 기존 코드베이스의 모든 폼이 순수 `FormData` 기반 서버 액션 패턴을 따르고 있어 일관성을 유지)

`createJobPost` 서버 액션(`app/(app)/jobposts/actions.ts`)은 `questionCount`만큼 반복하며 question/answer 쌍을 모으고, 질문과 답변이 모두 채워진 쌍만 유효한 것으로 취급한다. 유효한 쌍이 하나도 없으면 기존 방식대로 에러 메시지와 함께 리다이렉트한다. `job_posts.insert`에는 `cover_letter_text` 대신 `questions` 배열을 그대로 넣고, `feedback_requested`가 켜져 있으면 `buildFeedbackLines(questions)`로 만든 줄 배열을 `feedback_docs.lines`에 저장한다.

## 피드 카드 (`app/(app)/jobposts/post-card.tsx`)

`post.coverLetterText` 한 덩어리 대신 `post.questions` 배열을 순회하며 문항마다 질문(작은 라벨)과 답변(본문)을 구분해서 보여준다.

## 피드백 화면 (`app/(app)/feedback/[id]/`)

`page.tsx`(서버 컴포넌트)는 `doc.lines`를 새 구조(`FeedbackLine[]`)로 받고, `groupCommentsByLine`으로 만든 줄별 댓글을 각 줄 객체에 합쳐 `{ index, questionIndex, question, text, comments }[]` 형태의 배열을 만든 뒤, 새 클라이언트 컴포넌트 `feedback-lines.tsx`에 통째로 넘긴다. (댓글 Map은 서버→클라이언트 컴포넌트 경계를 넘길 수 없으므로 배열/객체로 변환)

`feedback-lines.tsx`(신규, `'use client'`)가 실제 렌더링과 펼침/접힘 상호작용을 담당한다:

- 문항이 바뀌는 지점마다 질문 텍스트를 섹션 제목으로 보여준다 (문항별로 표시 번호도 1부터 다시 매김)
- 댓글이 없는 줄은 우측에 작은 "+" 트리거만, 댓글이 있는 줄은 "💬 개수"를 보여준다 (모든 대댓글 포함한 총 개수)
- 트리거를 클릭하면 그 줄 바로 아래에 `CommentThread`(기존 컴포넌트 재사용)가 삽입되며 펼쳐진다 — 배경색을 살짝 강조해 GitHub PR 리뷰의 "라인 하이라이트 + 인라인 코멘트 박스" 느낌을 낸다
- 한 번에 하나의 줄만 펼쳐진다 (다른 줄을 클릭하면 이전에 펼쳐졌던 줄은 접힘) — `useState<number | null>`로 펼쳐진 줄의 인덱스 하나만 관리
- `CommentThread`, `addFeedbackComment` 서버 액션은 그대로 재사용 (변경 없음)

## 영향받지 않는 부분

- `lib/jobposts/comments.ts` (`groupCommentsByLine`) — `lineIndex`가 숫자라는 것 외에는 줄의 의미를 몰라도 되는 순수 함수라 변경 불필요
- `app/(app)/feedback/[id]/actions.ts` (`addFeedbackComment`) — 그대로 재사용
- `app/(app)/feedback/[id]/comment-thread.tsx` — 그대로 재사용
- `lib/jobposts/calendar.ts`, `app/(app)/jobposts/calendar/page.tsx` — 회사명/날짜만 다루므로 영향 없음
- `job_post_reactions`, RLS 정책 — 변경 없음

## 테스트 전략

- `buildFeedbackLines`: 문항 여러 개 입력 시 `questionIndex`가 올바르게 붙는지, 마침표/줄바꿈 분리, 마침표+줄바꿈 연속 시 빈 줄이 생기지 않는지, 소수점 같은 알려진 한계 케이스는 테스트하지 않음(범위 밖으로 명시)
- `createJobPost`: 인덱스 기반 `question-{i}`/`answer-{i}` 필드를 올바르게 조립하는지, 질문/답변 중 하나라도 비어있는 쌍은 제외하는지, 유효한 쌍이 0개면 에러 리다이렉트하는지
- `PostForm`: 문항 추가/삭제 버튼 동작 (React Testing Library의 `userEvent`로 클릭 시뮬레이션)
- `PostCard`: 여러 문항이 각각 질문/답변으로 렌더링되는지
- `FeedbackPage`: 문항 헤더가 문항 경계마다 표시되는지
- `FeedbackLines`: 트리거 클릭 시 해당 줄만 펼쳐지는지, 다른 줄 클릭 시 이전 줄이 접히는지, 댓글 개수 배지가 대댓글 포함해서 맞게 표시되는지

## 가정 / 비목표

- 문항 개수 제한 없음 (최소 1개, 최대 제한 없음)
- 질문 텍스트는 프리셋 없이 자유 입력
- 마침표+줄바꿈 연속으로 생기는 빈 줄은 버린다 (문단 간격 보존 기능은 제거)
- 마침표 기반 문장 분리는 단순 문자 스캔이며, 약어/소수점의 마침표까지 문장 경계로 오인할 수 있음 — NLP 수준 문장 분리는 범위 밖
- 기존 `job_posts` 테스트 데이터의 `cover_letter_text` 내용은 마이그레이션으로 소실됨 (실사용 데이터 없음을 전제)
- 한 번에 하나의 줄만 펼쳐지는 아코디언 방식 (여러 줄 동시 펼침 없음)
