const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const LATE_THRESHOLD_SECONDS = 10 * 3600
const BASE_FINE = 10000
const FINE_INCREMENT = 1000
const FINE_INCREMENT_SECONDS = 5 * 60

function kstSecondsSinceMidnight(iso: string): number {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds()
}

export function computeLateFine(iso: string): { isLate: boolean; fineAmount: number } {
  const secondsSinceMidnight = kstSecondsSinceMidnight(iso)

  if (secondsSinceMidnight < LATE_THRESHOLD_SECONDS) {
    return { isLate: false, fineAmount: 0 }
  }

  const secondsLate = secondsSinceMidnight - LATE_THRESHOLD_SECONDS
  const increments = Math.floor(secondsLate / FINE_INCREMENT_SECONDS)
  return { isLate: true, fineAmount: BASE_FINE + increments * FINE_INCREMENT }
}

export function formatKstTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const hours = kst.getUTCHours()
  const minutes = kst.getUTCMinutes()
  const period = hours < 12 ? '오전' : '오후'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${period} ${displayHours}:${String(minutes).padStart(2, '0')}`
}
