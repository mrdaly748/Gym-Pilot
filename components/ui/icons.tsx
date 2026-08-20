import type { SVGProps } from "react";

/**
 * Small, hand-authored icon set (Phase 9.5) — no icon-library dependency.
 * Outline style, 1.5px stroke, sized via className by the caller. Only
 * icons actually used by a shared component live here; add more only when
 * a real consumer needs one (see components/ui/README.md).
 */

type IconProps = SVGProps<SVGSVGElement>;

function baseProps(props: IconProps): IconProps {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/** GymPilot brand mark — an abstract upward chevron in a rounded square. */
export function LogoMark(props: IconProps) {
  return (
    <svg {...baseProps(props)} strokeWidth={1.75}>
      <rect x="3" y="3" width="18" height="18" rx="6" />
      <path d="M8 14l4-4 4 4" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="9" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
    </svg>
  );
}

export function MembersIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 20c0-3.6 3.13-6.5 7-6.5s7 2.9 7 6.5" />
    </svg>
  );
}

export function MembershipsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="12" r="2" />
      <path d="M13.5 10h4" />
      <path d="M13.5 14h4" />
    </svg>
  );
}

export function PaymentsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9" />
      <path d="M9.5 9.75c0-1.1 1.12-2 2.5-2s2.5.72 2.5 1.65-1.12 1.35-2.5 1.35-2.5.45-2.5 1.5S10.62 14.5 12 14.5s2.5-.65 2.5-1.75" />
    </svg>
  );
}

export function AttendanceIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v3" />
      <path d="M16 3v3" />
      <path d="M8.5 14.5l2 2 4.5-4.5" />
    </svg>
  );
}

export function PlansIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3.5" />
    </svg>
  );
}

export function StaffIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.46-6 6-6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M13.8 14.2c2.4.3 4.2 2.5 4.2 5.3" />
    </svg>
  );
}

export function TrainersIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="5.5" cy="12" r="2.25" />
      <circle cx="18.5" cy="12" r="2.25" />
      <path d="M7.75 12h8.5" />
      <path d="M4 9.5v5" />
      <path d="M20 9.5v5" />
    </svg>
  );
}

export function ExpensesIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 6a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
      <path d="M8 10h6" />
      <path d="M8 14h4" />
    </svg>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function GymsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 11h.01" />
      <path d="M15 11h.01" />
    </svg>
  );
}

export function AssistantIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2z" />
      <path d="M9 10h6" />
      <path d="M9 13h3.5" />
    </svg>
  );
}
