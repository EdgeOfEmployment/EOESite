export const PROBLEM_IMAGES_BUCKET = 'problem-images'

/** Below `serverActions.bodySizeLimit` (5 MB in next.config.ts) with room for the multipart overhead. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The URL prefix `getPublicUrl()` produces for this bucket; everything after it is the object key. */
export function problemImagePublicPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${PROBLEM_IMAGES_BUCKET}/`
}

const MARKDOWN_IMAGE_URL = /!\[[^\]]*\]\(\s*([^)\s]+)/g

/** Object keys of this bucket's images referenced by `![...](url)` in any of the sources, deduplicated. */
export function extractImagePaths(markdownSources: string[], publicPrefix: string): string[] {
  const paths = new Set<string>()
  for (const source of markdownSources) {
    for (const match of source.matchAll(MARKDOWN_IMAGE_URL)) {
      const url = match[1]
      if (url.startsWith(publicPrefix) && url.length > publicPrefix.length) paths.add(url.slice(publicPrefix.length))
    }
  }
  return [...paths]
}
