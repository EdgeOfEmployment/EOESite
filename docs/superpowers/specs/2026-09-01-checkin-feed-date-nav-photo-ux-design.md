# 인증 피드 날짜별 보기 + 사진 첨부 UX 개선

## 배경

사용자가 현재 `/checkin` 피드 화면 스크린샷에 손으로 표시해 요청한 개선 사항:

1. 지금 `/checkin` 피드는 전체 기간의 모든 게시물을 한 목록에 무한정 보여준다. 특정 날짜의 게시물만 보고 싶을 때 스크롤로 찾아야 해서 불편하다.
2. 사진 첨부 `<input type="file">`이 브라우저 기본 스타일 그대로라 다크 모드에서 버튼이 잘 안 보이고, "파일 선택" 버튼과 "선택된 파일 없음" 텍스트가 좁은 공간에서 겹쳐 보인다.

(스크린샷에 표시된 하단의 빈 공간 표시는 실제 기능 요청이 아니라 단순 여백 구분이었음을 브레인스토밍 과정에서 확인했다.)

## 변경 1: 날짜별 피드 필터링 (`app/(app)/checkin/page.tsx`)

- `searchParams`에 `date?: string`(`YYYY-MM-DD`) 추가.
- 선택된 날짜(`selectedDate`) 계산: `date` 파라미터가 `/^\d{4}-\d{2}-\d{2}$/` 정규식을 통과하고 `new Date(`${date}T00:00:00.000Z`)`가 유효한 날짜(`Invalid Date` 아님, 즉 `getTime()`이 `NaN`이 아님)일 때만 사용. 형식이 안 맞거나 파싱이 안 되면(예: `2026-13-45`) KST 기준 오늘 날짜(`getKstDateString`)로 폴백. `selectedDate`가 KST 기준 오늘보다 미래면(문자열 비교로 판단 가능 — `YYYY-MM-DD` 포맷은 사전식 비교가 곧 시간순 비교와 같음) 오늘로 clamp — 오늘보다 미래로는 못 넘어간다는 UX 규칙을 URL 직접 조작으로 우회할 수 없게 한다.
- `checkin_posts` 쿼리에 `kstDayRangeUtc(selectedDate)`로 계산한 `start`/`end`를 `.gte('created_at', start).lt('created_at', end)`로 추가 — 지금처럼 전체 기간을 다 가져오지 않고 그 날의 게시물만 가져온다.
- 상단에 날짜 네비게이터 추가: `◀ {formatKstDateHeading(selectedDate)}{isToday ? ' (오늘)' : ''} ▶`
  - `◀`는 항상 `<Link href="/checkin?date=${prevDate}">` (과거로는 얼마든지 이동 가능)
  - `▶`는 `isToday`면 비활성 표시(링크 아님, 옅은 텍스트), 아니면 `<Link href="/checkin?date=${nextDate}">`
  - 캘린더 페이지(`calendar/page.tsx`)의 `날짜별`/`멤버별` 토글과 동일하게 순수 서버 컴포넌트 + `<Link>` 패턴을 사용 — 별도 클라이언트 상태 불필요.
- `<PostForm />`은 `isToday`일 때만 렌더링한다. 과거 날짜를 보고 있을 때는 그 날짜의 게시물 목록만 보이고 작성 폼은 나타나지 않는다 — 지각 계산이 "제출 시점의 현재 시각" 기준이라 과거 날짜로 소급 제출한다는 개념 자체가 없기 때문.
- `PostForm`이 안 보일 때 대체 문구 없음(단순히 렌더링 안 함) — 과거 날짜 조회는 "기록 열람" 용도이지 액션이 필요한 화면이 아니므로.
- 기존 `error`/`success` 쿼리 파라미터 처리는 그대로 유지. `createCheckinPost`가 성공/실패 시 리다이렉트하는 곳은 여전히 `/checkin` (date 파라미터 없음 = 오늘)이며, 제출은 항상 "오늘" 컨텍스트에서만 가능하므로 이 부분은 자연스럽게 맞아떨어진다.
- `달력 보기` 링크는 변경하지 않는다(범위 밖) — 선택한 날짜를 캘린더 페이지로 전달하는 건 이번 스코프에 포함하지 않는다.

### `lib/checkin/time.ts`에 추가할 순수 함수

```typescript
export function getKstDateString(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return kst.toISOString().slice(0, 10)
}

export function kstDayRangeUtc(dateStr: string): { start: string; end: string } {
  const startOfDayKst = new Date(`${dateStr}T00:00:00.000Z`)
  const start = new Date(startOfDayKst.getTime() - KST_OFFSET_MS).toISOString()
  const end = new Date(startOfDayKst.getTime() + 24 * 60 * 60 * 1000 - KST_OFFSET_MS).toISOString()
  return { start, end }
}

export function shiftKstDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function formatKstDateHeading(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
```

네 함수 모두 기존 `computeLateFine`/`formatKstTime`과 동일하게 UTC 오프셋 연산만 쓰는 순수 함수다(서버 로컬 타임존에 의존하는 `getHours()` 등 사용 금지 원칙 유지). `getKstDateString`은 기존 `kstSecondsSinceMidnight`과 같은 `KST_OFFSET_MS` 상수를 재사용한다.

## 변경 2: 사진 첨부 버튼 스타일링 + 썸네일 미리보기 (`app/(app)/checkin/post-form.tsx`)

- `<input type="file">`을 숨긴 별도 엘리먼트로 만들지 않고, Tailwind의 `file:*` 의사 엘리먼트 변형 클래스로 네이티브 파일 인풋 자체를 스타일링한다 (`file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground hover:file:bg-accent/90 file:cursor-pointer cursor-pointer` 형태). 네이티브 `required`/`accept`/`name="photo"` 시맨틱과 접근성은 그대로 유지되고, 별도 라벨-히든인풋 트릭이나 JS 클릭 위임이 필요 없다.
- 선택된 파일의 로컬 미리보기를 위해 클라이언트 상태 추가:
  - `const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null)`
  - `onChange` 핸들러에서 `e.target.files?.[0]`이 있으면: 기존 `photoPreview.url`이 있으면 `URL.revokeObjectURL`로 해제 → `URL.createObjectURL(file)`로 새 URL 생성 → `{ url, name: file.name }`으로 상태 갱신.
  - 컴포넌트 언마운트 시 `useEffect` cleanup으로 마지막 object URL을 `revokeObjectURL` — 메모리 누수 방지.
  - 파일을 선택하면 버튼 아래에 `<img src={photoPreview.url} alt="선택한 사진 미리보기" className="mt-2 h-20 w-20 rounded object-cover">`와 `{photoPreview.name}` 텍스트를 표시. 선택 전에는 아무것도 안 보임.
  - 별도의 "제거/취소" 버튼은 만들지 않는다 — 다시 "사진 선택"을 눌러 새 파일을 고르면 미리보기가 교체되는 것으로 충분(범위 최소화, 사용자 승인 완료).
- 서버로 실제 전송되는 값은 지금과 동일한 `name="photo"` 파일 인풋 하나뿐이다. `actions.ts`의 `createCheckinPost`는 이번 변경과 무관 — 서버는 여전히 실제 업로드된 파일만 신경 쓰고, 미리보기는 순수 클라이언트 표시용이다.

## 영향받지 않는 부분

- `app/(app)/checkin/post-card.tsx`, `app/(app)/checkin/actions.ts` — 변경 없음. 게시물 카드는 어떤 날짜를 보고 있든 동일하게 렌더링되고, 서버 액션은 그대로다.
- `app/(app)/checkin/calendar/page.tsx`, `app/(app)/page.tsx`(대시보드) — 변경 없음. 대시보드의 "오늘"/"이번 달" 집계와 캘린더 페이지의 월별 보기는 이번 변경과 독립적이다.
- 댓글/리액션 기능 — 어떤 날짜의 게시물이든 동일하게 동작.
- `lib/checkin/status.ts`, `lib/checkin/fines.ts` — 변경 없음.

## 테스트 전략

- `lib/checkin/time.test.ts`: `getKstDateString`(KST 자정 전후 UTC 경계 케이스 포함), `kstDayRangeUtc`(하루의 시작/끝이 정확히 KST 00:00~24:00에 대응하는 UTC 범위인지), `shiftKstDateString`(±1일, 월/연도 경계 넘어가는 케이스), `formatKstDateHeading` 각각에 대한 단위 테스트 추가.
- `app/(app)/checkin/page.test.tsx`: `date` 파라미터 없이 접속 시 오늘 날짜로 필터링되는지, `date` 파라미터로 특정 과거 날짜 접속 시 그 날의 게시물만 보이고 `<PostForm>`이 안 보이는지, 오늘 날짜(또는 파라미터 없음)일 때만 `<PostForm>`이 보이는지, `▶`가 오늘 볼 때는 링크가 아니라는 것(또는 없다는 것)을 테스트.
- `app/(app)/checkin/post-form.test.tsx`: 파일 선택 시 미리보기 이미지와 파일명이 나타나는지 테스트. jsdom은 `URL.createObjectURL`/`revokeObjectURL`을 기본 구현하지 않으므로, 테스트 파일에서 `global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')`과 `global.URL.revokeObjectURL = vi.fn()`을 `beforeEach`에서 스텁해야 한다.

## 가정 / 비목표

- 날짜 네비게이터는 하루 단위 이동만 지원한다("N일 전으로 점프" 같은 날짜 피커는 범위 밖 — 필요하면 이미 있는 `달력 보기` 링크로 월 단위 탐색 가능).
- 사진 미리보기에 "제거" 버튼을 추가하지 않는다(사용자 승인 완료).
- `달력 보기` 링크가 현재 보고 있는 날짜를 캘린더 페이지에 전달하도록 만들지 않는다(범위 밖).
- 미래 날짜로의 이동은 UI(▶ 비활성화)와 서버(clamp) 양쪽에서 모두 막는다 — URL을 직접 조작해도 오늘 날짜로 강제된다.
