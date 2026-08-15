import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Skeleton className="h-8 w-56" />
      <div className="mb-4 mt-4 flex gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-96 w-full" />
    </main>
  )
}
