# 10시 인증 할일(목표) 드래그 순서 변경 설계

## 배경

`/checkin` 게시물 작성 폼(`post-form.tsx`)과 수정 모드(`goals-editor.tsx`) 모두 목표(할일) 목록을 순서대로 입력/편집할 수 있지만, 순서를 바꾸려면 항목을 삭제하고 다시 추가하는 수밖에 없다. 두 곳 모두 드래그로 순서를 바꿀 수 있게 한다.

## 범위

- 작성 폼(`PostForm`)에서 목표 입력 중 드래그로 순서 변경 가능.
- 수정 모드(`GoalsEditor`의 편집 상태)에서 드래그로 순서 변경 가능.
- 비편집 모드(체크리스트 표시)는 대상이 아니다 — 완료 토글 UI는 기존과 동일하게 유지.
- DB 스키마 변경 없음. 순서는 지금처럼 `goals` jsonb 배열의 인덱스로 결정된다.
- 새 의존성 추가: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## 라이브러리 선택

`@dnd-kit`을 사용한다. 활발히 유지보수되고 있고, 마우스/터치/키보드 드래그를 모두 기본 지원한다. `react-beautiful-dnd`는 유지보수가 중단되어 제외하고, 네이티브 HTML5 Drag and Drop API는 모바일 터치 지원이 약해 제외한다.

## UI 동작

- 각 목표 항목 왼쪽에 전용 드래그 핸들(그립 아이콘)을 추가한다. 핸들을 잡고 드래그해야만 순서가 바뀌며, 텍스트 입력창을 클릭/포커스하는 동작과 충돌하지 않는다.
- 데스크톱 마우스 드래그와 모바일 터치 드래그를 모두 지원한다. 키보드 포커스 상태에서도 방향키로 순서를 바꿀 수 있게 한다(dnd-kit의 키보드 센서 기본 지원 활용).
- 드래그 중에는 잡은 항목이 목록 내에서 다른 항목들 위로 이동하며 실시간으로 자리를 비켜준다(dnd-kit 기본 동작).
- **작성 폼**: 드래그로 순서를 바꾸면 로컬 state만 바뀐다. 폼을 제출("10시 인증하기")할 때 최종 순서대로 `goal-${index}` 필드가 만들어진다.
- **수정 모드**: 드래그로 순서를 바꾸면 `draft` 로컬 state만 바뀐다. 기존과 동일하게 "저장" 버튼을 눌러야 서버에 반영되고, "취소"를 누르면 순서 변경도 버려진다. 드래그 자체는 서버 요청을 일으키지 않는다.

## 데이터 모델 변경 (로컬 상태 한정)

dnd-kit의 `SortableContext`는 항목마다 배열 인덱스가 아닌 안정적인 `id`가 필요하다(드래그 중 인덱스가 바뀌므로). DB나 서버 액션 시그니처는 바뀌지 않고, 클라이언트 로컬 상태에만 id를 추가한다.

- `post-form.tsx`: `goals: string[]` → `goals: { id: string; value: string }[]`. `addGoal()`에서 `crypto.randomUUID()`로 새 id를 만든다.
- `goals-editor.tsx`: `draft`의 타입을 `(CheckinGoal & { _id: string })[]`로 바꾼다. `startEditing()`에서 `goals`를 복사할 때, `addGoal()`에서 새 항목을 만들 때 각각 `crypto.randomUUID()`로 `_id`를 부여한다. `saveGoals()`가 `FormData`를 만들 때는 `_id`를 제외하고 기존 필드(`goal-${i}`, `completed-${i}`, `completedAt-${i}`)만 사용한다.

## 공용 컴포넌트

`components/ui/sortable-item.tsx` 신설 (`'use client'`):

- `SortableItem({ id, children }: { id: string; children: (props: { dragHandleProps: ...; isDragging: boolean }) => ReactNode })`: `useSortable({ id })`를 감싸고, 항목 전체에 적용할 transform/transition 스타일과 `setNodeRef`를 처리한 `<div>`를 렌더링하며, 드래그 핸들에 붙일 `listeners`/`attributes`(`dragHandleProps`)를 렌더 prop으로 넘긴다.
- 드래그 핸들 아이콘: 아이콘 라이브러리가 없으므로 인라인 SVG(세로 점 6개, 그립 모양)를 사용하는 작은 컴포넌트를 같은 파일 또는 `components/ui/icons.tsx`에 둔다.

## 두 파일에 적용

`post-form.tsx`, `goals-editor.tsx`(편집 모드) 각각에서:

1. `DndContext`로 목표 목록 영역을 감싼다.
   - `sensors`: `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`. `PointerSensor`가 마우스와 터치를 모두 처리하므로 `TouchSensor`는 따로 쓰지 않는다. `activationConstraint`로 8px 이상 움직여야 드래그가 시작되게 해, 입력창 클릭/탭과 드래그 시작을 구분한다.
   - `onDragEnd(event)`: `active.id !== over?.id`일 때 `arrayMove(items, oldIndex, newIndex)`로 로컬 state를 갱신한다.
2. `SortableContext`(`items={ids}`, `strategy={verticalListSortingStrategy}`)로 목록을 감싼다.
3. 각 행을 `SortableItem`으로 감싸고, 렌더 prop으로 받은 `dragHandleProps`를 드래그 핸들 아이콘에 `{...listeners} {...attributes}`로 적용한다. 기존의 `Input`, "삭제" 버튼 마크업은 그대로 두고 핸들만 앞에 추가한다.

## 데이터 흐름 요약

**작성 폼**: 사용자가 핸들을 드래그 → `onDragEnd`에서 `arrayMove`로 `goals` 로컬 state 재정렬 → 폼 제출 시 재정렬된 순서 그대로 `goal-${index}` 히든 필드 생성 → `createCheckinPost` 서버 액션(변경 없음)이 순서대로 저장.

**수정 모드**: 사용자가 핸들을 드래그 → `onDragEnd`에서 `arrayMove`로 `draft` 재정렬 → "저장" 클릭 → 기존 `buildGoalsFormData(draft)`가 재정렬된 순서로 `FormData` 구성 → `updateCheckinGoals` 서버 액션(변경 없음) 호출.

## 에러 처리

- dnd-kit 자체는 클라이언트 로컬 상태만 다루므로 새로운 서버 에러 케이스는 없다.
- 드래그 중 브라우저 포커스가 텍스트 입력창에 있어도 `activationConstraint`(8px 이동) 덕분에 오탐 드래그가 발생하지 않는다.
- 항목이 1개 이하일 때는 드래그가 의미 없지만 막을 필요는 없다(dnd-kit이 자연스럽게 처리).

## 테스트 계획

- 새로운 서버 액션이나 서버 로직 변경이 없으므로 `actions.test.ts`는 수정하지 않는다.
- `app/(app)/checkin/post-form.test.tsx`(신규 또는 기존 파일에 추가): 드래그 이벤트를 실제로 시뮬레이션하는 대신, `onDragEnd` 핸들러에 해당하는 재정렬 로직을 별도 순수 함수로 뽑아 유닛 테스트하거나, dnd-kit의 테스트 유틸리티가 지원하는 범위 내에서 핵심 재정렬 동작만 검증한다. 드래그 핸들이 렌더링되는지, 핸들이 없는 경우(항목 0~1개) UI가 깨지지 않는지 확인한다.
- `app/(app)/checkin/goals-editor.test.tsx`: 편집 모드에서 드래그 핸들이 각 항목에 렌더링되는지 확인. `arrayMove` 적용 후 "저장" 시 `updateCheckinGoals`에 재정렬된 순서로 `FormData`가 전달되는지 검증(직접 `onDragEnd` 핸들러를 호출하거나, 재정렬 로직을 별도 함수로 뽑아 테스트).
- 실제 드래그 앤 드롭(마우스/터치 좌표 이동)의 브라우저 동작 확인은 유닛 테스트로 완전히 커버하기 어려우므로, 필요 시 수동으로 `npm run dev` 환경에서 데스크톱/모바일 뷰포트로 확인한다.
