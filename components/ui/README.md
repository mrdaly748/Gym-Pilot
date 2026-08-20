# Shared UI primitives

Phase 9.5 (UI/UX & Product Polish). Presentation-only components — none of
them import `@/lib/server/*` or fetch data themselves; pages pass data in as
props exactly as they do today. `Button`/`ConfirmSubmitButton` are the only
client components (`useFormStatus`, `<dialog>` open/close state); everything
else stays a Server Component.

- `Button` — `variant: primary | secondary | danger | ghost`. Reflects the
  enclosing `<form>`'s pending state automatically when `type="submit"`.
- `TextInput`, `Select` — label-wraps-input, same implicit label
  association every existing form already used.
- `Table`, `Thead`, `Th`, `Td`, `Tr`, `EmptyRow` — same `<table>` semantics
  as before, centralized styling, horizontal scroll on narrow viewports.
- `Badge` — status communicated by color *and* label text, never color alone.
- `PageHeader` — title + optional back-link + optional right-aligned actions.
- `FormSection` — the "create X" form wrapper, includes its own `Flash`.
- `Flash` — renders the `?error=`/`?success=` query-param conventions.
- `StatCard` — promoted from `dashboard/page.tsx`'s local component.
- `ConfirmSubmitButton` — a UX safeguard (native `<dialog>`) for
  destructive actions. **Not** a security boundary — see its own header
  comment.
- `icons.tsx` — a small hand-authored inline SVG set, no icon-library
  dependency. Add an icon only when a real consumer needs it.
