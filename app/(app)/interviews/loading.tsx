import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-28" />
      <Skeleton className="h-10 w-full" />
      <ul className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Skeleton className="h-20 w-full" />
          </li>
        ))}
      </ul>
    </main>
  )
}
