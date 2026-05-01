/**
 * Review detail skeleton — header + body card + composer placeholder so the
 * detail page slides in without shifting.
 */
export default function Loading() {
  return (
    <div className="space-y-5 max-w-[1100px] animate-pulse">
      <div className="h-3 w-24 bg-white/[0.04] rounded" />
      <div className="card p-5 flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-white/[0.06]" />
        <div className="flex-1">
          <div className="h-5 w-48 bg-white/[0.08] rounded" />
          <div className="h-3 w-72 bg-white/[0.04] rounded mt-2" />
          <div className="h-3 w-40 bg-white/[0.04] rounded mt-1.5" />
        </div>
        <div className="h-5 w-28 bg-white/[0.06] rounded" />
      </div>
      <div className="card p-6">
        <div className="h-3 w-24 bg-white/[0.04] rounded" />
        <div className="h-4 w-full bg-white/[0.05] rounded mt-3" />
        <div className="h-4 w-5/6 bg-white/[0.05] rounded mt-2" />
        <div className="h-4 w-2/3 bg-white/[0.05] rounded mt-2" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 space-y-3">
          <div className="h-4 w-32 bg-white/[0.06] rounded" />
          <div className="h-44 w-full bg-white/[0.04] rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-white/[0.06] rounded" />
            <div className="h-9 w-32 bg-white/[0.08] rounded" />
          </div>
        </div>
        <div className="card p-5 space-y-3">
          <div className="h-4 w-32 bg-white/[0.06] rounded" />
          <div className="h-9 w-full bg-white/[0.06] rounded" />
          <div className="h-32 w-full bg-white/[0.04] rounded" />
        </div>
      </div>
    </div>
  );
}
