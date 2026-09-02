# 10시 인증 할일(목표) 수정 기능 설계

## 배경

`/checkin` 페이지에서 게시물을 작성할 때 목표(할일) 목록을 입력할 수 있지만, 게시 후에는 완료 체크(☑/☐) 토글만 가능하고 목표의 텍스트를 고치거나 항목을 추가/삭제할 수 없다. 작성자가 게시 후에도 목표를 자유롭게 수정할 수 있도록 한다.

## 범위

- 게시 후 목표 텍스트 수정, 항목 추가, 항목 삭제를 모두 지원한다.
- 수정 권한은 글 작성자(`isAuthor`)만 가지며, 시간 제한은 없다(기존 완료 토글과 동일한 조건).
- 완료 토글 기능(`toggleGoalCompleted`)은 그대로 유지한다. 목표 텍스트만 편집할 때 완료 상태(`completed`, `completedAt`)는 보존된다.

## UI 동작

- 평소(비편집 모드): 기존과 동일하게 체크박스 + 텍스트로 목표를 표시한다. 글 작성자에게는 목표 목록 옆에 "수정" 버튼을 표시한다.
- "수정" 버튼을 누르면 편집 모드로 전환된다:
  - 각 목표가 텍스트 입력창(`Input`)으로 바뀌고, 각 항목 옆에 "삭제" 버튼이 나타난다.
  - 하단에 "+ 항목 추가" 버튼이 나타나 새 빈 입력창을 추가할 수 있다.
  - "저장", "취소" 버튼이 나타난다. "취소"를 누르면 변경 사항을 버리고 비편집 모드로 돌아간다.
- "저장"을 누르면 서버 액션을 호출해 목표 배열 전체를 갱신하고, 성공 시 비편집 모드로 돌아간다. 빈 텍스트 항목은 저장 시 제외된다(기존 작성 폼과 동일한 규칙).
- 목표가 0개인 게시물도 작성자에게는 "수정" 버튼이 보여 편집 모드 진입 후 항목을 추가할 수 있다.

## 컴포넌트 구조

- `app/(app)/checkin/post-card.tsx`(서버 컴포넌트)에서 목표 목록 렌더링 블록(42~67행)을 제거하고, 새 클라이언트 컴포넌트로 대체한다:
  ```tsx
  <GoalsEditor postId={post.id} goals={post.goals} isAuthor={isAuthor} />
  ```
- 새 파일 `app/(app)/checkin/goals-editor.tsx` (`'use client'`):
  - props: `postId: string`, `goals: CheckinGoal[]`, `isAuthor: boolean`
  - 로컬 상태: `editing: boolean`, `draft: CheckinGoal[]`
  - 비편집 모드 렌더링은 기존 `post-card.tsx`의 마크업(체크박스 폼 + 완료 시각 표시)을 그대로 옮긴다. 완료 토글은 기존 `toggleGoalCompleted` 서버 액션을 그대로 사용한다.
  - 편집 모드 렌더링: 목표별 `Input` + 삭제 버튼, "+ 항목 추가" 버튼, "저장"/"취소" 버튼.
  - "수정" 클릭 시 `draft`를 `goals`의 깊은 복사로 초기화하고 `editing = true`.
  - "취소" 클릭 시 `editing = false` (draft는 버림).
  - "저장" 클릭 시: `draft`로부터 `FormData`를 구성해 `updateCheckinGoals(postId, formData)` 서버 액션을 직접 호출(함수처럼 await)하고, 완료되면 `editing = false`로 되돌린다.

## 서버 액션

`app/(app)/checkin/actions.ts`에 `updateCheckinGoals(postId: string, formData: FormData)` 추가:

1. 로그인 사용자 확인 (`!user` → `로그인이 필요합니다` throw), 기존 액션들과 동일한 패턴.
2. `checkin_posts`에서 `author_id`를 조회하고, 호출자와 다르면 `권한이 없습니다` throw (`toggleGoalCompleted`와 동일한 패턴).
3. `formData`에서 `goalCount`, `goal-{i}`, `completed-{i}`, `completedAt-{i}`를 읽어 `CheckinGoal[]`을 구성한다. `goal-{i}`를 trim한 값이 빈 문자열이면 해당 인덱스는 건너뛴다(= 삭제/빈 항목 처리). `completed-{i}`는 `'true'` 문자열일 때만 `true`로 간주하고, `completedAt-{i}`는 `completed`가 `true`일 때만 값을 사용하고 아니면 `null`로 저장한다.
4. `checkin_posts.goals`를 새 배열로 통째로 `update`.
5. `revalidatePath('/checkin')`.

이 액션은 `redirect` 대신 `throw`로 에러를 알리는 `toggleGoalCompleted`/`toggleReaction` 계열과 동일한 관례를 따른다(폼 제출이 아니라 직접 호출로 쓰이므로 리다이렉트가 맞지 않음).

## 데이터 흐름 요약

작성자가 편집 모드에서 텍스트를 고치거나 항목을 추가/삭제 → "저장" 클릭 → 클라이언트에서 `draft` 배열을 `FormData`로 직렬화 → `updateCheckinGoals` 서버 액션 호출 → DB 업데이트 + `revalidatePath('/checkin')` → 서버 컴포넌트가 최신 `goals`로 재렌더 → `GoalsEditor`가 `editing = false` 상태로 최신 `goals` prop을 표시.

## 에러 처리

- 권한 없음/미로그인 시 서버 액션이 `throw` → 기존 관례상 별도 에러 바운더리 UI는 없으므로 Next.js 기본 에러 처리에 위임한다(다른 폼 기반 액션들과 동일한 수준).
- 저장 중 네트워크/서버 에러가 나면 `editing` 상태를 유지해 사용자가 다시 시도할 수 있게 한다(즉, `editing = false`는 액션이 성공적으로 resolve된 뒤에만 실행).

## 테스트 계획

- `app/(app)/checkin/actions.test.ts`: `updateCheckinGoals` describe 블록 추가
  - 본인 글의 목표를 텍스트 수정/추가/삭제해 정상적으로 `update`가 호출되는지
  - 빈 텍스트 항목이 걸러지는지
  - 완료 상태(`completed`/`completedAt`)가 보존되는지
  - 타인 글을 수정하려 하면 `권한이 없습니다`를 throw하는지
- 새 테스트 파일 `app/(app)/checkin/goals-editor.test.tsx`
  - 작성자에게만 "수정" 버튼이 보이는지
  - "수정" 클릭 시 입력창/추가/삭제/저장/취소 버튼이 나타나는지
  - "+ 항목 추가" 클릭 시 새 입력창이 추가되는지, 삭제 클릭 시 항목이 사라지는지
  - "취소" 클릭 시 변경 사항이 버려지고 원래 목표가 다시 보이는지
  - "저장" 클릭 시 `updateCheckinGoals`가 올바른 인자로 호출되는지 (mock)
- 기존 `post-card.test.tsx`의 목표 관련 단언은 `GoalsEditor`로 옮기거나, `PostCard`가 `GoalsEditor`를 통해 값을 넘기는 정도만 남기고 세부 동작 테스트는 새 파일로 이관한다.
