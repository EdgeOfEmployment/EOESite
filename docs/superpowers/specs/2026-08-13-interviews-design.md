# 모의면접 게시판 설계

## 배경

스터디 그룹 사이트의 네 번째 게시판. 기존 세 게시판(인증, 코테 스터디, 자소서/공고)과 마찬가지로 `/interviews` 경로에 위치하며, `components/nav.tsx`에는 이미 링크가 존재하지만 페이지는 아직 구현되지 않았다.

모의면접 게시판은 두 단계로 구성된다:

1. **일정 예약**: 승인된 멤버 누구나 모의면접 세션(날짜/시간/제목/설명)을 생성할 수 있고, 다른 멤버는 참석 여부를 체크(RSVP)한다.
2. **질문/답변 피드백**: 세션이 끝난 뒤, 참여자 각자가 자신이 받은 질문과 답변을 그 세션에 연결해서 등록한다. 등록 즉시 자소서 게시판과 동일한 방식(문장 단위 분리 + 클릭-확장 댓글, PR 리뷰 스타일)으로 피드백을 받을 수 있다.

피드백 화면은 방금 완성한 자소서 게시판의 `FeedbackLines`/`CommentThread`/`splitIntoSentences`를 그대로 재사용한다.

## 데이터 모델

```sql
-- 세션 (승인된 멤버 누구나 생성)
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  session_at timestamptz not null,
  description text,
  created_at timestamptz not null default now()
);

-- 참석 체크 (RSVP, 단순 토글)
create table interview_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

-- QA 등록 (참여자가 세션에 연결해서 등록, job_posts.questions와 동일한 구조)
create table interview_qas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

-- feedback_docs를 job_posts 전용에서 두 도메인 공용으로 일반화
alter table feedback_docs alter column job_post_id drop not null;
alter table feedback_docs add column interview_qa_id uuid references interview_qas(id) on delete cascade unique;
alter table feedback_docs add constraint feedback_docs_exactly_one_parent check (
  (job_post_id is not null and interview_qa_id is null) or
  (job_post_id is null and interview_qa_id is not null)
);
```

`feedback_comments`는 `feedback_doc_id`로만 연결되어 있어 스키마 변경이 필요 없다.

`interview_qas`에는 자소서의 `feedback_requested` 같은 선택 플래그가 없다 — 모의면접 QA는 항상 피드백이 목적이므로, 등록 시 `feedback_docs` 스냅샷이 항상 자동 생성된다.

### RLS

- `interview_sessions`: 승인된 멤버 select. Insert는 `created_by = auth.uid() and is_approved()`. Delete는 작성자 본인 또는 admin.
- `interview_participants`: 승인된 멤버 select. Insert는 `user_id = auth.uid() and is_approved()`. Delete(체크 해제)는 `user_id = auth.uid()`.
- `interview_qas`: 승인된 멤버 select. Insert는 `author_id = auth.uid() and is_approved()`. Delete는 작성자 본인 또는 admin.
- `feedback_docs` insert 정책: 기존 "본인 job_post 소유자만 생성 가능" 조건에 "본인 interview_qa 소유자만 생성 가능" 조건을 OR로 추가.

## 페이지 / 라우팅

- **`/interviews`** — 세션 목록(예정/지난 세션 구분 표시), 세션 생성 폼, 각 카드에 RSVP 버튼과 참석자 수/이름 표시
- **`/interviews/[sessionId]`** — 세션 상세: 참석자 목록, 해당 세션에 등록된 QA 글 목록(`QaCard`), QA 등록 폼
- **`/feedback/[id]`** — 기존 페이지를 그대로 재사용. `feedback_docs` 조회 시 `job_post_id` 또는 `interview_qa_id` 중 어느 쪽으로 연결됐는지 분기해서 상위 컨텍스트(회사명 또는 세션 제목)를 가져오는 부분만 추가. `FeedbackLines`, `CommentThread`는 이미 `feedbackDocId`/`lineIndex` 기반의 일반적 컴포넌트라 무수정.

### 공유 로직 리팩터

`splitIntoSentences`/`buildFeedbackLines`(현재 `lib/jobposts/snapshot.ts`)는 두 도메인이 공유하게 되므로 `lib/feedback/snapshot.ts`로 이동하고, `lib/jobposts/snapshot.ts`는 거기서 re-export해서 기존 import 경로를 깨지 않는다.

## 컴포넌트 / 서버 액션

- `lib/interviews/types.ts` — `InterviewSession`, `InterviewParticipant`, `InterviewQa` (questions 필드는 자소서의 `JobPostQuestion` 타입 재사용)
- `app/(app)/interviews/actions.ts`
  - `createSession(formData)` — title/session_at/description 검증 후 insert
  - `toggleParticipation(sessionId)` — 있으면 delete, 없으면 insert
  - `deleteSession(sessionId)` — 작성자 또는 admin만
  - `createInterviewQa(sessionId, formData)` — `createJobPost`와 동일한 인덱스 기반 동적 문항 파싱, insert 후 `feedback_docs` 스냅샷 자동 생성
  - `deleteInterviewQa(qaId)` — 작성자 또는 admin만
- `app/(app)/interviews/page.tsx` — 세션 목록 서버 컴포넌트
- `app/(app)/interviews/session-form.tsx` — 세션 생성 폼 (서버 컴포넌트, 클라이언트 상태 불필요)
- `app/(app)/interviews/session-card.tsx` — 세션 카드 + RSVP 버튼
- `app/(app)/interviews/[sessionId]/page.tsx` — 세션 상세 서버 컴포넌트
- `app/(app)/interviews/[sessionId]/qa-form.tsx` — 동적 문항 추가/삭제 클라이언트 컴포넌트. `post-form.tsx`와 로직이 거의 동일하므로, 공유 훅으로 뽑을지 그대로 복제할지는 구현 단계(계획 작성 시)에서 판단
- `app/(app)/interviews/[sessionId]/qa-card.tsx` — QA 항목 카드, 피드백 보기 링크(`/feedback/[id]`)

작성자 본인 또는 admin에게만 삭제 버튼이 보이는 패턴은 `post-card.tsx`의 `isAdmin` prop 방식을 재사용한다.

`components/nav.tsx`의 `/interviews` 링크는 이미 존재하므로 별도 수정이 필요 없다.

## 영향받지 않는 부분

- 자소서/공고(`jobposts`) 게시판의 기존 동작, RLS, 컴포넌트는 변경되지 않는다 (단, `feedback_docs`가 nullable해지고 `snapshot.ts`가 이동하는 것은 예외 — 아래 "가정/비목표" 참고).
- 인증/코테 스터디 게시판 무관.

## 테스트 전략

기존 컨벤션을 그대로 따른다: 서버 액션·헬퍼는 vitest 유닛테스트로 TDD, 클라이언트 컴포넌트(`qa-form.tsx`, `session-card.tsx`)는 `@testing-library/react` + `fireEvent`로 상호작용 테스트. `lib/feedback/snapshot.ts` 이동 후에도 기존 `lib/jobposts/snapshot.test.ts`는 그대로 통과해야 한다(re-export 경로 검증).

## 가정 / 비목표

- 세션 수정(edit) 기능 없음 — 생성/삭제만 지원.
- 참석 체크는 단순 토글이며 이력을 남기지 않는다.
- 알림/리마인더 기능 없음.
- `feedback_docs.job_post_id`를 nullable로 바꾸는 마이그레이션은 기존 자소서 데이터에 영향을 주지 않는다(기존 행은 모두 `job_post_id`가 채워져 있고 `interview_qa_id`는 null).
- QA 등록은 참석 체크 여부와 무관하게 가능하다(체크하지 않은 멤버도 QA를 등록할 수 있음) — 강제 검증하지 않는다.
