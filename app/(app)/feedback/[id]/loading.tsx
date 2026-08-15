import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-24" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </main>
  )
}
