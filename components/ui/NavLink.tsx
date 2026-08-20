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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-accent/10 text-accent" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
