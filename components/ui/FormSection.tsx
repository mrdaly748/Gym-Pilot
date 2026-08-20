import type { ReactNode } from "react";
import { Flash } from "./Flash";

export function FormSection({
  title,
  error,
  children,
}: {
  title: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 max-w-sm">
      <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</h2>
      <div className="mt-3">
        <Flash error={error} />
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </section>
  );
}
