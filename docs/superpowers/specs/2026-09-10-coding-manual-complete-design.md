# 코딩보드에 "수동 완료 처리" 재도입 (자동 감지와 구분 표시)

## 배경

2026-08-13에 코딩보드의 "완료" 판정을 GitHub push 자동 감지로만 결정하도록 변경했다
(`docs/superpowers/specs/2026-08-13-coding-push-only-check-design.md`). 당시 사용자는
"push를 하지 않았는데 완료로 바뀐 경우가 있다"고 보고했지만, 조사 결과 원인은 웹훅 버그가
아니라 기존에 있던 수동 체크 버튼이 정상 동작한 것이었다 — 자동/수동 두 경로의 결과가 화면에서
전혀 구분되지 않아 혼란을 일으켰다. 그래서 수동 체크 경로를 완전히 제거했다
(`supabase/migrations/0008_lock_coding_checks.sql`이 `coding_checks`의 멤버 INSERT/DELETE
RLS 정책을 모두 삭제).

이후 실사용 결과 자동(push) 감지만으로는 부족하다는 것이 확인되어(로컬로만 풀거나 다른 방식으로
제출하는 경우 등), 수동 완료 처리를 다시 요청받았다. 단, 지난번 혼란이 재발하지 않도록 이번에는
수동 완료와 자동 감지 완료를 화면에서 명확히 구분해서 표시한다.

## DB 변경 (`supabase/migrations/0015_coding_checks_manual_source.sql`, 신규)

```sql
alter table coding_checks
  add column source text not null default 'auto' check (source in ('auto', 'manual'));

create policy "Members can create own manual coding checks"
  on coding_checks for insert
  with check (user_id = auth.uid() and source = 'manual' and public.is_approved());

create policy "Members can delete own manual coding checks"
  on coding_checks for delete
  using (user_id = auth.uid() and source = 'manual');
```

- `default 'auto'`는 기존에 웹훅을 통해서만 쌓인 행들을 그대로 `'auto'`로 백필한다.
- INSERT 정책은 `source = 'manual'`만 허용하므로 일반 인증 클라이언트로는 `'auto'` 행을 만들
  수 없다 (`'auto'`는 여전히 service-role 웹훅 라우트로만 생성됨).
- DELETE 정책은 본인의 `'manual'` 행만 허용한다. `'auto'` 행 삭제는 기존
  `"Admins can delete coding checks"` 정책(관리자 전용)만 남는다 — 이번 변경으로 건드리지 않음.

## 웹훅 변경 (`app/api/github-webhook/route.ts`)

- `coding_checks` upsert 시 `source: 'auto'`를 명시적으로 포함시킨다 (63-88번째 줄 부근의
  upsert 호출).
- 효과: 사용자가 먼저 수동으로 체크해둔 문제를 나중에 실제로 push하면, upsert가
  `problem_id, user_id`로 같은 행을 덮어써 `source`가 `'manual'` → `'auto'`로 자동
  승격된다(수동 체크가 자동 검증으로 대체됨). 반대 방향(auto → manual)으로는 절대 덮어쓰이지
  않는다 — 서버 액션은 항상 INSERT만 시도하고, 이미 행이 있으면(unique 제약 위반) 아무 것도 하지
  않는다.

## 서버 액션 변경 (`app/(app)/coding/actions.ts`)

```ts
export async function markSelfComplete(problemId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) throw new Error('권한이 없습니다')

  const { data: problem, error: problemError } = await supabase
    .from('coding_problems')
    .select('assignee_ids')
    .eq('id', problemId)
    .single()

  if (problemError) throw new Error(problemError.message)
  const assigneeIds = (problem?.assignee_ids as string[] | null) ?? []
  if (assigneeIds.length > 0 && !assigneeIds.includes(user.id)) {
    throw new Error('본인에게 배정된 문제가 아닙니다')
  }

  const { error } = await supabase
    .from('coding_checks')
    .insert({ problem_id: problemId, user_id: user.id, source: 'manual' })

  // unique(problem_id, user_id) 위반(이미 체크됨, 레이스 컨디션)은 조용히 무시한다.
  if (error && error.code !== '23505') throw new Error(error.message)

  revalidatePath('/coding')
}

export async function unmarkSelfComplete(problemId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_checks')
    .delete()
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .eq('source', 'manual')

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}
```

- `markSelfComplete`는 배정 확인(assignee_ids가 비어있지 않은데 본인이 없으면 거부)을
  서버 쪽에서도 강제한다 — 화면에는 배정된 사람에게만 버튼이 보이지만, 서버 액션을 직접
  호출하는 경로에 대한 방어.
- `unmarkSelfComplete`의 `.eq('source', 'manual')`은 RLS와 중복되는 방어 계층이다 — RLS만으로도
  `'auto'` 행은 삭제되지 않지만(행이 매치되지 않아 0건 삭제), 애플리케이션 레벨에서도 명시한다.
- 기존 `adminRemoveCheck`, `deleteProblem` 등은 변경 없음.

## UI 변경 (`app/(app)/coding/problem-card.tsx`, `app/(app)/coding/page.tsx`)

- `page.tsx`: `coding_checks` select에 `source` 컬럼 추가, `session.userId`를
  `ProblemCard`에 `currentUserId` prop으로 전달.
- `lib/coding/types.ts`의 `CodingCheck`에 `source: 'auto' | 'manual'` 필드 추가.
- `problem-card.tsx`:
  - `currentUserId` prop 추가.
  - 배지 텍스트/스타일을 출처까지 구분:
    - 미완료: `미완료` (기존과 동일, 회색 테두리)
    - 자동 완료: `완료 (자동 감지)` — 기존 회색 배경 배지 유지
    - 수동 완료: `완료 (본인 체크)` — 앰버 계열 배경 배지(`bg-amber-100 border-amber-300
      dark:bg-amber-900 dark:border-amber-700`)로 시각적으로도 구분
  - 본인 행(`member.id === currentUserId`)이고 미완료인 경우: "완료 처리" 버튼 노출
    (`<form action={markSelfComplete.bind(null, problem.id)}>`).
  - 본인 행이고 수동 완료(`check.source === 'manual'`)인 경우: "취소" 버튼 노출
    (`<form action={unmarkSelfComplete.bind(null, problem.id)}>`). 자동 완료인 본인 행에는
    이 버튼을 노출하지 않는다(관리자만 취소 가능, 기존 동작 유지).
  - 관리자의 기존 "취소" 버튼(`isAdmin && checked`)은 출처 무관하게 그대로 유지 — 변경 없음.

## 영향받지 않는 부분

- `createProblems`, `deleteProblem`, `updateGithubUsername`, `adminRemoveCheck` — 변경 없음.
- 웹훅의 파일 경로 매칭 로직, 저장소 검증 로직 — 변경 없음.
- 기존에 쌓인 `coding_checks` 데이터 — 마이그레이션이 `source`를 `'auto'`로 백필할 뿐, 별도
  정리는 하지 않는다.

## 테스트 전략

- `actions.test.ts`: `markSelfComplete`에 대해 (1) 미인증이면 에러, (2) 배정된 문제가 아니면
  에러, (3) 배정이 비어있거나 본인이 배정에 포함되면 `source: 'manual'`로 insert 후
  `revalidatePath` 호출, (4) unique 위반(23505) 에러는 무시하고 정상 종료. `unmarkSelfComplete`에
  대해 (1) 미인증이면 에러, (2) 본인 소유 + `source='manual'` 조건으로 delete 호출 후
  `revalidatePath`.
- `problem-card.test.tsx`: 본인 행 + 미완료 → "완료 처리" 버튼 노출. 본인 행 + 수동 완료 →
  "취소" 버튼과 앰버 배지 노출. 본인 행 + 자동 완료 → 취소 버튼 없이 회색 배지("자동 감지")
  노출. 타인 행은 출처와 무관하게 읽기 전용(배지만, 버튼 없음). 관리자는 출처 무관하게 기존
  "취소" 버튼 노출.
- `route.test.ts`: 기존 웹훅 upsert 테스트들에 `source: 'auto'`가 upsert payload에 포함되는지
  검증 추가.

## 가정 / 비목표

- 수동 완료에 확인 다이얼로그를 두지 않는다 — 기존 "삭제"/"취소" 버튼과 동일하게 즉시 실행.
- 배정되지 않은 문제(assignee_ids가 비어있어 "모두 배정"으로 취급되는 경우)는 모든 승인된
  멤버가 자신의 행에서 수동 완료 처리를 할 수 있다.
- 관리자가 타인을 대신해 수동 완료 처리하는 기능은 이번 범위에 포함하지 않는다(본인만 본인 행을
  처리).
