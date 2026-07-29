import { signUp } from './actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto mt-20 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">회원가입</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <form action={signUp} className="flex flex-col gap-4">
        <label htmlFor="name" className="sr-only">
          이름
        </label>
        <input
          id="name"
          name="name"
          placeholder="이름"
          required
          className="rounded border px-3 py-2"
        />
        <label htmlFor="email" className="sr-only">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="이메일"
          required
          className="rounded border px-3 py-2"
        />
        <label htmlFor="password" className="sr-only">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          minLength={6}
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          가입하기
        </button>
      </form>
    </main>
  )
}
