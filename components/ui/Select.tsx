import type { SelectHTMLAttributes } from "react";
import { FIELD_CLASSES } from "./TextInput";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function Select({ label, className = "", children, ...props }: SelectProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-text-secondary">{label}</span>
      <select {...props} className={`${FIELD_CLASSES} ${className}`}>
        {children}
      </select>
    </label>
  );
}
