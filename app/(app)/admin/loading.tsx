import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-40" />
      <section className="mb-10">
        <Skeleton className="mb-4 h-6 w-28" />
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="mb-4 h-6 w-20" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    </main>
  )
}
