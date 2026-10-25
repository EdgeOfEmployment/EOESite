import { Skeleton } from '@/components/skeleton'

// One boundary for every /tour page: the detail pages await their params and the fixtures at
// the top level (like the real detail pages, which each have their own loading.tsx), and
// Cache Components requires that kind of request-time read to sit under a Suspense boundary.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </main>
  )
}
