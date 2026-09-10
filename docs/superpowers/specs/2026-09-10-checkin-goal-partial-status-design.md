# 10시 인증 할일 반완료(세모) 상태 설계

## 배경

`/checkin` 게시물의 목표(할일)는 지금 완료(☑)/미완료(☐) 2단계만 있다. 목표를 부분적으로만 달성했을 때를 표현할 방법이 없어, 완료로 처리하거나 미완료로 남겨두는 수밖에 없다. "세모(△)" — 부분 달성 — 상태를 추가한다.

## 범위

- 체크리스트 뷰(비편집 모드)에서 목표 상태를 미완료(☐)/반완료(△)/완료(☑) 3단계로 표시·변경할 수 있다.
- 상태 변경은 글 작성자만 가능하며, 지금처럼 시간 제한 없이 언제든 바꿀 수 있다.
- 수정(편집) 모드(`GoalsEditor`의 텍스트/순서 편집)는 이 변경의 대상이 아니다 — 상태 변경 UI는 체크리스트 뷰에만 추가된다.
- 기존에 저장된 게시물의 `completed: boolean` 데이터를 DB 마이그레이션으로 `status` 문자열로 일괄 변환한다. 코드에는 `completed` 필드를 읽는 하위호환 로직을 두지 않는다.

## 데이터 모델 변경

`lib/checkin/types.ts`의 `CheckinGoal`:

```ts
export type CheckinGoalStatus = 'todo' | 'partial' | 'done'

export interface CheckinGoal {
  body: string
  status: CheckinGoalStatus
  completedAt: string | null
}
```

- `completed: boolean` 필드를 제거하고 `status: CheckinGoalStatus`로 교체한다.
- `completedAt`은 `status === 'done'`일 때만 값이 채워지고, 그 외(`'todo'`, `'partial'`)에는 항상 `null`이다. `'done'`에서 다른 상태로 바뀌면 `completedAt`도 함께 `null`로 초기화된다.

## DB 마이그레이션

새 파일 `supabase/migrations/0014_checkin_goal_status.sql` (데이터 마이그레이션, 스키마 변경 없음 — `goals`는 이미 `jsonb`):

```sql
update checkin_posts
set goals = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'body', g->>'body',
        'status', case when (g->>'completed')::boolean then 'done' else 'todo' end,
        'completedAt', g->'completedAt'
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(goals) as g
)
where goals is not null and jsonb_array_length(goals) > 0;
```

- 기존 `completed: true` → `status: 'done'` (기존 `completedAt` 값 유지)
- 기존 `completed: false` → `status: 'todo'`, `completedAt`도 기존 값 그대로 유지된다(원래 `false`일 때 항상 `null`이었으므로 결과적으로 `null`).
- 배포 시 이 마이그레이션을 애플리케이션 코드 배포와 함께/이전에 적용해야 한다. 적용 전에는 코드가 기대하는 `status` 필드가 없어 화면이 깨진다(하위호환 로직 없음).

## UI 동작

- 체크리스트 뷰에서 각 목표 옆에 ☐ / △ / ☑ 세 개의 작은 버튼이 **항상 나란히** 표시된다(작성자에게만). 원하는 상태의 아이콘을 클릭하면 그 상태로 바로 바뀐다(토글이나 순환이 아니라 목표 상태를 직접 지정).
- 현재 상태에 해당하는 아이콘은 강조 표시(굵게/배경 강조 등)되어 어떤 상태인지 한눈에 보인다.
- 목표 텍스트 스타일:
  - `'todo'`: 기본 텍스트 색상.
  - `'partial'`: 취소선 없이 회색(muted) 텍스트만. 별도 텍스트 라벨은 없다.
  - `'done'`: 기존과 동일하게 회색 + 취소선, 그리고 "완료 {시각}" 텍스트 표시(`formatKstTime(completedAt)`).
- 비작성자가 볼 때는 세 버튼 없이 현재 상태 아이콘 하나만 읽기 전용으로 표시한다(지금 완료/미완료 아이콘을 읽기 전용으로 보여주는 것과 동일한 패턴, 아이콘만 3종으로 늘어남).
- 수정(편집) 모드의 마크업/동작은 이번 변경으로 바뀌지 않는다.

## 서버 액션

`app/(app)/checkin/actions.ts`의 `toggleGoalCompleted(postId, goalIndex)`를 `setGoalStatus(postId, goalIndex, status: CheckinGoalStatus)`로 교체한다(토글이 아니라 목표 상태를 명시적으로 지정하는 방식으로 바뀌므로 이름도 의미에 맞게 바꾼다):

1. 로그인 사용자 확인(`!user` → `로그인이 필요합니다` throw) — 기존과 동일.
2. `checkin_posts`에서 `author_id`, `goals`를 조회하고 호출자와 다르면 `권한이 없습니다` throw — 기존과 동일.
3. 대상 인덱스의 목표를 찾아, `status`가 유효한 값(`'todo' | 'partial' | 'done'`)인지 확인한다(아닌 값이면 `잘못된 상태입니다` throw).
4. 새 `status`를 적용하고, `completedAt`은 `status === 'done'`이면 `new Date().toISOString()`, 아니면 `null`로 설정한다.
5. `checkin_posts.goals`를 통째로 `update`.
6. `revalidatePath('/checkin')`.

체크리스트 뷰의 세 버튼은 각각 `<form action={setGoalStatus.bind(null, postId, index, 'todo' | 'partial' | 'done')}>`으로 감싼 `<button type="submit">`으로 구현한다(기존 `toggleGoalCompleted` 바인딩 패턴과 동일하게 서버 액션을 폼으로 직접 호출).

`createCheckinPost`와 `updateCheckinGoals`도 `completed`/`completedAt` 필드를 만드는 부분을 `status`로 바꾼다:

- `createCheckinPost`: 새로 만드는 목표는 항상 `status: 'todo'`, `completedAt: null`로 시작(기존과 동일한 동작, 필드명만 변경).
- `updateCheckinGoals`: 편집 모드는 상태를 바꾸지 않는 화면이지만, 저장 시 기존 목표의 `status`/`completedAt`을 그대로 보존해야 한다(지금 `completed`/`completedAt`을 보존하는 것과 동일한 방식 — `FormData`에 `status-${i}`, `completedAt-${i}`를 실어 보내고 서버 액션이 그대로 복원).

## 컴포넌트 구조

`app/(app)/checkin/goals-editor.tsx`의 `GoalsEditor` 비편집 모드 렌더링을 변경한다:

- 목표별로 상태 배지/버튼 3개(☐ △ ☑)를 렌더링하는 작은 서브컴포넌트(예: `GoalStatusControl`)를 같은 파일 내에 추가하거나 인라인으로 구현한다.
- 작성자(`isAuthor`)일 때만 3버튼 폼을 렌더링하고, 아닐 때는 현재 상태에 맞는 아이콘 하나만 `<span>`으로 렌더링한다.
- 편집 모드(`draft` 기반 텍스트/순서 편집)의 `buildGoalsFormData`는 `completed-${i}`/`completedAt-${i}` 대신 `status-${i}`/`completedAt-${i}`를 채우도록 바꾼다.

## 데이터 흐름 요약

작성자가 ☐/△/☑ 중 하나를 클릭 → 해당 상태를 바인딩한 `setGoalStatus` 서버 액션 폼 제출 → 서버가 목표 배열에서 해당 인덱스의 `status`/`completedAt`을 갱신하고 `checkin_posts.goals`를 통째로 `update` → `revalidatePath('/checkin')` → 최신 `goals`로 재렌더.

## 에러 처리

- 잘못된 `status` 값이 서버 액션에 전달되면 throw로 막는다(폼 버튼은 항상 유효한 값만 바인딩하므로 정상 사용 흐름에서는 발생하지 않고, 방어적 검증 목적).
- 권한 없음/미로그인은 기존 `toggleGoalCompleted`와 동일하게 throw로 처리하고 별도 에러 바운더리는 두지 않는다.

## 테스트 계획

- `app/(app)/checkin/actions.test.ts`:
  - `createCheckinPost`: 새 목표가 `status: 'todo'`, `completedAt: null`로 생성되는지 (기존 `completed: false` 단언을 교체).
  - `toggleGoalCompleted` describe 블록을 `setGoalStatus`로 교체:
    - `'todo'` → `'done'`으로 바꾸면 `completedAt`이 채워지는지.
    - `'done'` → `'todo'`/`'partial'`로 바꾸면 `completedAt`이 `null`로 초기화되는지.
    - `'todo'` → `'partial'`로 바꾸면 `status`만 바뀌고 `completedAt`은 계속 `null`인지.
    - 잘못된 status 문자열을 넘기면 throw하는지.
    - 타인 글에 호출하면 `권한이 없습니다`를 throw하는지 (기존과 동일).
  - `updateCheckinGoals`: 저장 시 각 목표의 `status`/`completedAt`이 보존되는지(기존 `completed`/`completedAt` 보존 테스트를 필드명만 교체).
- `app/(app)/checkin/goals-editor.test.tsx`:
  - 작성자에게 목표별로 3개 상태 버튼이 렌더링되는지.
  - 비작성자에게는 상태 버튼 없이 현재 상태 아이콘만 보이는지.
  - `'partial'` 버튼 클릭 시 `setGoalStatus`가 `(postId, index, 'partial')` 인자로 호출되는지(mock).
  - `'partial'` 상태일 때 텍스트가 취소선 없이 회색으로만 표시되는지, 시간 라벨이 없는지.
  - `'done'` 상태 표시(취소선 + "완료 {시각}")는 기존 테스트를 필드명만 `status: 'done'`으로 바꿔 유지.
  - 편집 모드(텍스트/순서 편집) 저장 시 `status`/`completedAt`이 `FormData`에 올바르게 담기는지(기존 `completed-${i}` 단언을 `status-${i}`로 교체).
- `app/(app)/checkin/post-card.test.tsx`: 목표 픽스처의 `completed: boolean`을 `status: CheckinGoalStatus`로 교체.
- 마이그레이션 자체에 대한 자동 테스트는 없다(다른 마이그레이션들과 동일한 관례) — 로컬 Supabase에 적용해 수동으로 변환 결과를 확인한다.
