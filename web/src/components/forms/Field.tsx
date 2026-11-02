import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    required: boolean;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
};

/** Pass the supplied attributes to the input, select, or textarea. */
export function Field({ id, label, hint, error, required = false, children }: FieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");

  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
      {children({
        id,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}
