import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-2 h-4 w-64" />
      <Skeleton className="mt-6 h-48 w-full" />
    </main>
  )
}
