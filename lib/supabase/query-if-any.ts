export async function queryIfAny<T>(
  ids: string[],
  query: () => PromiseLike<{ data: T[] | null }>
): Promise<{ data: T[] | null }> {
  return ids.length ? query() : { data: [] }
}
