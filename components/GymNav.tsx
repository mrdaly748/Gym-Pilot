import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import type { Role } from "@/lib/server/authorization";
import { NavLink } from "@/components/ui/NavLink";
import {
  AnalyticsIcon,
  AssistantIcon,
  AttendanceIcon,
  DashboardIcon,
  ExpensesIcon,
  LogoMark,
  LogoutIcon,
  MembersIcon,
  MembershipsIcon,
  MenuIcon,
  PaymentsIcon,
  PlansIcon,
  StaffIcon,
  TrainersIcon,
} from "@/components/ui/icons";

/**
 * Persistent, role-aware navigation for the whole /gym/[gymId]/* area
 * (Phase 9.5). Presentation only: `role` is passed in by
 * app/gym/[gymId]/layout.tsx, which already resolved it via
 * requireGym()/requireRole() before rendering anything — this component
 * makes no auth call and no service call of its own. Every link below
 * points at a route independently guarded by that route's own
 * requireRole() check (see each page.tsx) — hiding a link here is a
 * convenience, not the authorization boundary.
 *
 * No client JS is needed for the mobile toggle: a checkbox + <label> +
 * `peer-checked:` CSS drives showing/hiding the link list below the
 * `md:` breakpoint, where it's always visible regardless of the checkbox.
 * The single set of <NavLink> elements is never duplicated in the DOM, so
 * accessible-role lookups (e.g. Playwright's getByRole("link", { name })
 * used throughout tests/e2e/provisioning.spec.ts) always resolve to
 * exactly one match at any viewport.
 */
export function GymNav({ gymId, role }: { gymId: string; role: Role }) {
  const isAdmin = role === "GYM_ADMIN";

  return (
    <nav className="border-b border-gray-200 bg-white md:flex md:min-h-full md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-4 py-3.5 md:border-b md:border-gray-200">
        <Link href={`/gym/${gymId}`} className="flex items-center gap-2 text-gray-900">
          <LogoMark className="h-6 w-6 text-accent" />
          <span className="text-base font-semibold tracking-tight">GymPilot</span>
        </Link>
        <label
          htmlFor="gym-nav-toggle"
          className="cursor-pointer rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </label>
      </div>

      <input type="checkbox" id="gym-nav-toggle" className="peer hidden" />

      <div className="hidden flex-col justify-between border-t border-gray-100 px-3 py-3 peer-checked:flex md:flex md:flex-1 md:border-t-0 md:py-4">
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink href={`/gym/${gymId}/dashboard`} icon={<DashboardIcon className="h-4.5 w-4.5" />}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink href={`/gym/${gymId}/members`} icon={<MembersIcon className="h-4.5 w-4.5" />}>
              Members
            </NavLink>
          </li>
          <li>
            <NavLink
              href={`/gym/${gymId}/memberships`}
              icon={<MembershipsIcon className="h-4.5 w-4.5" />}
            >
              Memberships
            </NavLink>
          </li>
          <li>
            <NavLink href={`/gym/${gymId}/payments`} icon={<PaymentsIcon className="h-4.5 w-4.5" />}>
              Payments
            </NavLink>
          </li>
          <li>
            <NavLink
              href={`/gym/${gymId}/attendance`}
              icon={<AttendanceIcon className="h-4.5 w-4.5" />}
            >
              Attendance
            </NavLink>
          </li>

          {isAdmin && (
            <>
              <li className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                Admin
              </li>
              <li>
                <NavLink
                  href={`/gym/${gymId}/memberships/plans`}
                  icon={<PlansIcon className="h-4.5 w-4.5" />}
                >
                  Manage plans
                </NavLink>
              </li>
              <li>
                <NavLink href={`/gym/${gymId}/staff`} icon={<StaffIcon className="h-4.5 w-4.5" />}>
                  Manage staff
                </NavLink>
              </li>
              <li>
                <NavLink
                  href={`/gym/${gymId}/trainers`}
                  icon={<TrainersIcon className="h-4.5 w-4.5" />}
                >
                  Trainers
                </NavLink>
              </li>
              <li>
                <NavLink
                  href={`/gym/${gymId}/expenses`}
                  icon={<ExpensesIcon className="h-4.5 w-4.5" />}
                >
                  Expenses
                </NavLink>
              </li>
              <li>
                <NavLink
                  href={`/gym/${gymId}/analytics`}
                  icon={<AnalyticsIcon className="h-4.5 w-4.5" />}
                >
                  Analytics
                </NavLink>
              </li>
              <li>
                <NavLink
                  href={`/gym/${gymId}/assistant`}
                  icon={<AssistantIcon className="h-4.5 w-4.5" />}
                >
                  Assistant
                </NavLink>
              </li>
            </>
          )}
        </ul>

        <form action={logoutAction} className="mt-4 border-t border-gray-100 pt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
