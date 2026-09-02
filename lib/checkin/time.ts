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

export function getKstDateString(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return kst.toISOString().slice(0, 10)
}

export function kstDayRangeUtc(dateStr: string): { start: string; end: string } {
  const startOfDayKst = new Date(`${dateStr}T00:00:00.000Z`)
  const start = new Date(startOfDayKst.getTime() - KST_OFFSET_MS).toISOString()
  const end = new Date(startOfDayKst.getTime() + 24 * 60 * 60 * 1000 - KST_OFFSET_MS).toISOString()
  return { start, end }
}

export function kstMonthRangeUtc(dateStr: string): { start: string; end: string } {
  const [year, month] = dateStr.split('-').map(Number)
  const startOfMonthKst = new Date(Date.UTC(year, month - 1, 1))
  const endOfMonthKst = new Date(Date.UTC(year, month, 1))
  const start = new Date(startOfMonthKst.getTime() - KST_OFFSET_MS).toISOString()
  const end = new Date(endOfMonthKst.getTime() - KST_OFFSET_MS).toISOString()
  return { start, end }
}

export function shiftKstDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function formatKstDateHeading(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
