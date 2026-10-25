const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** The `?date=` of /checkin (and /tour/checkin): a real calendar date, clamped to today; anything else means today. */
export function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
    return todayKst
  }

  const parsed = new Date(`${dateParam}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateParam) {
    return todayKst
  }

  return dateParam > todayKst ? todayKst : dateParam
}
