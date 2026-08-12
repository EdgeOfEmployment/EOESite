export function buildFeedbackLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}
