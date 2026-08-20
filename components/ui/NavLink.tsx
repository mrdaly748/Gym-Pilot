"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The one piece of active-route highlighting in the nav shell that
 * genuinely needs the client: there is no stable Server Component API for
 * "the current pathname" in a shared layout. Everything else in
 * GymNav/PlatformNav stays a Server Component; only this leaf is
 * client-rendered.
 */
export function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center gap-3 rounded-r-lg border-l-2 py-2 pr-3 pl-2.5 text-sm font-medium transition-colors ${
        isActive
          ? "border-accent bg-accent-soft-bg text-accent"
          : "border-transparent text-text-secondary hover:bg-surface-3 hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
