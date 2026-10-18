export const PROBLEM_IMAGES_BUCKET = 'problem-images'

/** Below `serverActions.bodySizeLimit` (5 MB in next.config.ts) with room for the multipart overhead. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The URL prefix `getPublicUrl()` produces for this bucket; everything after it is the object key. */
export function problemImagePublicPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${PROBLEM_IMAGES_BUCKET}/`
}

const MARKDOWN_IMAGE_URL = /!\[[^\]]*\]\(\s*([^)\s]+)/g

// Keys the upload action generates: `${userId}/${uuid}${ext}`. Anything else (`..`, encoded or extra segments) is ignored.
const OBJECT_KEY = /^[0-9a-f-]+\/[0-9a-f-]+(\.[A-Za-z0-9]+)?$/i

/** Object keys of this bucket's images referenced by `![...](url)` in any of the sources, deduplicated. */
export function extractImagePaths(markdownSources: string[], publicPrefix: string): string[] {
  const paths = new Set<string>()
  for (const source of markdownSources) {
    for (const match of source.matchAll(MARKDOWN_IMAGE_URL)) {
      const url = match[1]
      if (!url.startsWith(publicPrefix)) continue
      const key = url.slice(publicPrefix.length).split(/[?#]/)[0]
      if (OBJECT_KEY.test(key)) paths.add(key)
    }
  }
  return [...paths]
}
