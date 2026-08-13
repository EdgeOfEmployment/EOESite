# 코딩보드 "완료"를 GitHub push 감지로만 결정하도록 변경

## 배경

`/coding` 보드는 두 가지 경로로 "완료" 상태를 만들 수 있었다: (1) 멤버 본인이 자기 행의 "체크" 버튼을 직접 클릭하는 수동 자가 체크, (2) `EdgeOfEmployment/Coding-Test` 저장소에 문제 파일을 push하면 GitHub 웹훅이 자동으로 감지해 체크하는 자동 감지(`docs/superpowers/plans/2026-08-10-github-auto-check.md`).

사용자가 "push를 하지 않았는데 완료로 바뀐 경우가 있다"고 보고했다. GitHub 웹훅 Recent Deliveries를 확인한 결과 해당 시점에 delivery 기록이 없었고, `coding_checks` 테이블에는 자동/수동 출처를 구분하는 컬럼이 없어(`supabase/migrations/0003_coding.sql`) 어느 경로로 체크됐는지 화면에서도 구분할 수 없었다. 조사 결과 원인은 웹훅 버그가 아니라 기존에 항상 존재했던 수동 체크 버튼이 정상 동작한 것이었지만, 두 경로의 결과가 화면상 구분되지 않아 혼란을 일으켰다.

사용자는 이 혼란을 근본적으로 없애기 위해 수동 체크 경로를 완전히 제거하고, "완료"가 오직 GitHub push 자동 감지로만 만들어지도록 요청했다. 이 조사 과정에서 웹훅이 이벤트의 출처 저장소를 검증하지 않는 별도 버그도 발견되어(같은 `GITHUB_WEBHOOK_SECRET`이 다른 저장소에 등록되면 그쪽 push도 매칭 대상이 됨) 이번 작업에 함께 포함한다.

## DB / RLS 변경 (`supabase/migrations/0008_lock_coding_checks.sql`, 신규)

```sql
drop policy "Members can create own coding checks" on coding_checks;
drop policy "Members can delete own coding checks" on coding_checks;

create policy "Admins can delete coding checks"
  on coding_checks for delete
  using (public.is_admin());
```

- 기존 두 정책(`user_id = auth.uid()` 기준 본인 INSERT/DELETE)을 제거한다. 이제 일반 인증 클라이언트로는 `coding_checks`에 INSERT할 수 있는 RLS 정책이 전혀 없다 — 유일한 쓰기 경로는 service-role 키를 쓰는 웹훅 라우트(`app/api/github-webhook/route.ts`)뿐이며, service-role은 RLS를 우회하므로 정책이 필요 없다.
- 신규 DELETE 정책은 `is_admin()`만 허용 — 관리자가 오탐(잘못 매칭된 자동 완료)을 취소할 수 있는 유일한 경로가 된다.
- 기존에 쌓인 `coding_checks` 행(출처 구분 없이 수동/자동 섞여 있음)은 그대로 유지한다. 마이그레이션은 정책만 바꾸고 데이터는 건드리지 않는다.

## 서버 액션 변경 (`app/(app)/coding/actions.ts`)

- `toggleCheck` 삭제.
- `adminRemoveCheck(problemId: string, userId: string)` 신규 추가:
  - 호출자 인증 확인 → `profiles.role === 'admin'`이 아니면 `throw new Error('권한이 없습니다')` (기존 `deleteProblem`과 동일한 패턴).
  - `coding_checks`에서 `problem_id`와 `user_id`가 모두 일치하는 행 삭제.
  - `revalidatePath('/coding')`.

## UI 변경 (`app/(app)/coding/problem-card.tsx`)

- `isSelf` 분기와 `toggleCheck` 바인딩 폼을 제거한다. 모든 멤버 행이 기존에 "다른 사람" 행에 쓰이던 읽기 전용 뱃지(완료 시 회색 배경, 미완료 시 기본)로 통일된다.
- `isAdmin`이면서 `checked`인 행에는 작은 "취소" 버튼을 추가로 렌더링한다. `<form action={adminRemoveCheck.bind(null, problem.id, member.id)}>`로 구현.
- `deleteProblem`(문제 자체 삭제) 버튼은 기존 그대로 유지 — 이번 변경과 무관.

## 웹훅 저장소 검증 (`app/api/github-webhook/route.ts`)

- 서명 검증(`verifySignature`) 통과 직후, `x-github-event`가 `push`인지 확인하는 기존 체크 다음에 저장소 검증을 추가한다:

```ts
const payload = JSON.parse(body)

if (payload.repository?.full_name !== process.env.GITHUB_SOURCE_REPO) {
  return NextResponse.json({ ok: true, skipped: 'unexpected repository' })
}
```

- 신규 env var `GITHUB_SOURCE_REPO`(값: `EdgeOfEmployment/Coding-Test`)를 `.env.local.example`에 문서화하고 Vercel 환경변수에도 추가 필요 (배포 설정은 코드 범위 밖이므로 이번 계획에 수동 확인 단계로 남긴다).
- 저장소가 다르면 서명이 유효해도 매칭 로직 전체를 건너뛴다.

## 영향받지 않는 부분

- 웹훅의 파일 경로 부분 문자열 매칭 로직(`route.ts`의 `matched` 계산) — 이번 범위 밖으로 명시적으로 제외.
- `profiles.github_username` 자율 등록 및 본인 인증 부재 — 이번 범위 밖.
- `createProblem`, `deleteProblem`, `updateGithubUsername`, `github-settings-form.tsx` — 변경 없음.
- `coding_checks` 기존 데이터 — 마이그레이션도, 별도 정리 스크립트도 실행하지 않는다.

## 테스트 전략

- `actions.test.ts`: `toggleCheck` 관련 describe 블록 전체 삭제. `adminRemoveCheck`에 대해 (1) admin이 아니면 에러를 던지고 delete가 호출되지 않는지, (2) admin이면 올바른 `problem_id`/`user_id`로 delete가 호출되고 `revalidatePath`가 불리는지 테스트.
- `problem-card.test.tsx`: 기존 "체크"/"완료" 토글 버튼 관련 테스트를 제거하고, 모든 멤버 행이 읽기 전용 뱃지로 렌더링되는지, admin일 때 완료된 행에만 "취소" 버튼이 보이는지, admin이 아니면 "취소" 버튼이 보이지 않는지 테스트.
- `route.test.ts`: `payload.repository.full_name`이 `GITHUB_SOURCE_REPO`와 다를 때 매칭 로직을 건너뛰고 `{ ok: true, skipped: 'unexpected repository' }`를 반환하는 테스트 추가 (`beforeEach`에 `vi.stubEnv('GITHUB_SOURCE_REPO', ...)` 추가, 기존 성공 케이스들의 테스트 payload에도 올바른 `repository.full_name` 필드를 채워야 함).

## 가정 / 비목표

- 관리자의 "취소" 액션에는 별도 확인 다이얼로그를 두지 않는다 (기존 "삭제" 버튼도 확인 없이 즉시 실행되는 패턴을 따름).
- `GITHUB_SOURCE_REPO` 불일치 시 응답은 401이 아니라 200 + `skipped`로 처리한다 (서명 자체는 유효하므로 "거부"가 아니라 "처리 대상 아님"이 맞는 의미론이며, 기존 `not a push event`/`no matching member` 등 다른 skip 케이스들과 응답 패턴을 통일).
- 기존에 이미 쌓인 수동 체크 기록은 이번 변경으로 소급 삭제되지 않는다 — 사용자가 명시적으로 "모두 그대로 유지"를 선택함.
