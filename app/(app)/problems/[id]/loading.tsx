import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 lg:max-w-4xl xl:max-w-5xl">
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-8 h-4 w-48" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </main>
  )
}
