import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <div className="mt-6 flex flex-col gap-6">
        {[0, 1].map((week) => (
          <section key={week}>
            <Skeleton className="mb-2 h-5 w-24" />
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
