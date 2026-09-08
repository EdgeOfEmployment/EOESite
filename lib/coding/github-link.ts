export function buildCommitFileUrl(commitSha: string, filePath: string): string | null {
  const repo = process.env.GITHUB_SOURCE_REPO
  if (!repo) return null

  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `https://github.com/${repo}/blob/${commitSha}/${encodedPath}`
}
