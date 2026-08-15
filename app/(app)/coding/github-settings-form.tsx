import { updateGithubUsername } from './actions'
import { Card } from '@/components/ui/card'

export function GithubSettingsForm({ currentUsername }: { currentUsername: string | null }) {
  return (
    <Card as="form" action={updateGithubUsername} className="mb-6 flex items-center gap-2 text-sm">
      <label htmlFor="githubUsername" className="whitespace-nowrap font-medium">
        내 GitHub 아이디
      </label>
      <input
        id="githubUsername"
        name="githubUsername"
        placeholder="GitHub 아이디"
        defaultValue={currentUsername ?? ''}
        required
        className="flex-1 rounded border border-gray-300 px-3 py-1 dark:border-gray-700"
      />
      <button type="submit" className="rounded border border-gray-300 px-3 py-1 dark:border-gray-700">
        저장
      </button>
    </Card>
  )
}
