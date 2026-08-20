/**
 * Renders the existing ?error= query-param convention (role="alert",
 * unchanged) alongside a new, matching ?success= convention (role="status")
 * — additive to what every actions.ts redirect already does, not a new
 * mechanism.
 */
export function Flash({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="mb-4 rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
        {success}
      </p>
    );
  }
  return null;
}
