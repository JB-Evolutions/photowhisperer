interface LoadingSkeletonProps {
  headerText: string;
}

export default function LoadingSkeleton({ headerText }: LoadingSkeletonProps) {
  return (
    <div className="flex flex-col gap-3">

      {/* Header row: gold pulsing dot + text */}
      <div className="flex items-center gap-2 px-1 py-1 text-sm text-text-muted">
        <span
          className="pw-dot-pulse inline-block h-2 w-2 flex-shrink-0 rounded-full bg-accent"
          aria-hidden="true"
        />
        {headerText}
      </div>

      {/* 4 skeleton cubes — same grid as SettingsCubes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="pw-skeleton-pulse h-[120px] rounded-[14px] border border-accent bg-surface-2"
          />
        ))}
      </div>

      {/* 3 skeleton panels — full-width summary + two half-width */}
      <div className="flex flex-col gap-3">
        <div className="pw-skeleton-pulse h-[60px] rounded-xl border border-border bg-surface-2" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="pw-skeleton-pulse h-[52px] rounded-xl border border-border bg-surface-2" />
          <div className="pw-skeleton-pulse h-[52px] rounded-xl border border-border bg-surface-2" />
        </div>
      </div>

    </div>
  );
}
