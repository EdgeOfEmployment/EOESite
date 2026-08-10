import { updateGithubUsername } from './actions'

export function GithubSettingsForm({ currentUsername }: { currentUsername: string | null }) {
  return (
    <form
      action={updateGithubUsername}
      className="mb-6 flex items-center gap-2 rounded border p-4 text-sm"
    >
      <label htmlFor="githubUsername" className="whitespace-nowrap font-medium">
        내 GitHub 아이디
      </label>
      <input
        id="githubUsername"
        name="githubUsername"
        placeholder="GitHub 아이디"
        defaultValue={currentUsername ?? ''}
        required
        className="flex-1 rounded border px-3 py-1"
      />
      <button type="submit" className="rounded border px-3 py-1">
        저장
      </button>
    </form>
  )
}
