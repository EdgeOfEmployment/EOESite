// Supabase Storage rejects keys containing spaces or non-ASCII characters
// (e.g. Korean screenshot filenames like "스크린샷 2026-08-14 143253.png"),
// so the original filename can't be used as-is in the upload path.
export function resolveExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}
