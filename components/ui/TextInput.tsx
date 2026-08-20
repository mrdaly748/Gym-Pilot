import type { InputHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

const FIELD_CLASSES =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

/**
 * Label wraps the input (implicit label association) — same accessible
 * pattern every existing form already uses, so getByLabel() keeps working
 * unchanged.
 */
export function TextInput({ label, hint, className = "", ...props }: TextInputProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input {...props} className={`${FIELD_CLASSES} ${className}`} />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export { FIELD_CLASSES };
