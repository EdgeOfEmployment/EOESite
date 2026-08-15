import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-24 w-full" />
      <ul className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Skeleton className="h-28 w-full" />
          </li>
        ))}
      </ul>
    </main>
  )
}
