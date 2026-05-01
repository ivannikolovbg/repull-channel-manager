/**
 * Reviews list skeleton — mirrors the final layout (header + 4 stat cards +
 * filter bar + table) so the page never visibly shifts when data lands.
 */
export default function Loading() {
  return (
    <div className="space-y-5 max-w-[1400px] animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-7 w-32 bg-white/[0.06] rounded" />
          <div className="h-3 w-72 bg-white/[0.04] rounded mt-2" />
        </div>
        <div className="h-9 w-32 bg-white/[0.06] rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="h-3 w-20 bg-white/[0.06] rounded" />
            <div className="h-7 w-16 bg-white/[0.08] rounded mt-2" />
            <div className="h-3 w-24 bg-white/[0.04] rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="card p-3 flex flex-wrap gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 w-32 bg-white/[0.06] rounded" />
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="h-9 bg-white/[0.03] border-b border-white/[0.06]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-t border-white/[0.04] flex items-center px-4 gap-3"
          >
            <div className="h-3 w-16 bg-white/[0.05] rounded" />
            <div className="h-3 w-32 bg-white/[0.05] rounded" />
            <div className="h-3 w-24 bg-white/[0.04] rounded" />
            <div className="h-3 flex-1 max-w-[400px] bg-white/[0.04] rounded" />
            <div className="h-5 w-20 bg-white/[0.05] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
