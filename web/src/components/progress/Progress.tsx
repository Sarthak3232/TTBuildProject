import { useId } from "react";

type ProgressProps = {
  label: string;
  value?: number;
  max: number;
  valueText?: string;
};

/** Omit value while loading to expose native indeterminate progress. */
export function Progress({ label, value, max, valueText }: ProgressProps) {
  const id = useId();
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = value === undefined || !Number.isFinite(value)
    ? undefined
    : Math.min(safeMax, Math.max(0, value));

  return (
    <div className="progress-field">
      <div className="progress-label">
        <label htmlFor={id}>{label}</label>
        <span>{valueText ?? (safeValue === undefined ? "Loading…" : `${safeValue} / ${safeMax}`)}</span>
      </div>
      <progress id={id} max={safeMax} value={safeValue} aria-valuetext={valueText} />
    </div>
  );
}
