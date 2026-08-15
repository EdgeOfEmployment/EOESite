import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-32" />
      <Skeleton className="h-16 w-full" />
      <div className="mt-6 flex flex-col gap-6">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </main>
  )
}
