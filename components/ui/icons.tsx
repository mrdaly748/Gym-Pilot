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
