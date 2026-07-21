import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indeterminate,
}: {
  value?: number;
  className?: string;
  indeterminate?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-orange-100/70",
        className,
      )}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 left-0 w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-orange-400 to-orange-600" />
      ) : (
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

/** Switch 开关 */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-orange-500" : "bg-zinc-200",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
