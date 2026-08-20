import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { NavLink } from "@/components/ui/NavLink";
import { GymsIcon, LogoMark, LogoutIcon } from "@/components/ui/icons";

/**
 * Deliberately lighter than GymNav — the Platform Admin area has one real
 * destination beyond its own home page, so a full sidebar would be empty
 * space, not hierarchy. A single top bar covers it. Presentation only,
 * same as GymNav: app/platform/layout.tsx already resolved
 * requireRole("PLATFORM_ADMIN") before rendering this.
 */
export function PlatformNav() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border-subtle bg-surface-1 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/platform" className="flex items-center gap-2.5 text-foreground">
          <LogoMark className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight">GymPilot</span>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-text-secondary">
            Platform Admin
          </span>
        </Link>
        <NavLink href="/platform/gyms" icon={<GymsIcon className="h-4.5 w-4.5" />}>
          Manage gyms
        </NavLink>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-3 hover:text-foreground"
        >
          <LogoutIcon className="h-4 w-4" />
          Log out
        </button>
      </form>
    </nav>
  );
}
