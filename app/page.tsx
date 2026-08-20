import Link from "next/link";
import {
  AnalyticsIcon,
  AssistantIcon,
  AttendanceIcon,
  LogoMark,
  MembersIcon,
  MembershipsIcon,
  PaymentsIcon,
  TrainersIcon,
} from "@/components/ui/icons";

const PRIMARY_CTA =
  "inline-flex items-center justify-center rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-strong-hover";
const SECONDARY_CTA =
  "inline-flex items-center justify-center rounded-lg border border-border-subtle bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-3";

const FEATURES = [
  {
    icon: MembersIcon,
    title: "Members",
    description: "Register, edit, and track every member's history in one place.",
  },
  {
    icon: MembershipsIcon,
    title: "Memberships",
    description: "Assign plans, renew, freeze, and cancel — with full history preserved.",
  },
  {
    icon: PaymentsIcon,
    title: "Payments",
    description: "Record payments, track outstanding balances, and correct mistakes with a clear audit trail.",
  },
  {
    icon: AttendanceIcon,
    title: "Attendance",
    description: "Fast check-in at the front desk, independent of membership status.",
  },
  {
    icon: TrainersIcon,
    title: "Trainers",
    description: "Manage trainers and their assigned members.",
  },
  {
    icon: AnalyticsIcon,
    title: "Analytics",
    description: "Revenue, attendance, and membership trends — at a glance.",
  },
  {
    icon: AssistantIcon,
    title: "AI Assistant",
    description: "Ask plain-language questions about your gym, answered from your own real data.",
  },
];

/**
 * Public, unauthenticated landing page (Phase 9.5) — fully static, no
 * session/data fetch, so it stays statically prerendered like before. No
 * self-serve signup exists in this product (product-spec.md §8.2) — both
 * CTAs correctly point at the real, only entry point, /login.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight text-foreground">GymPilot</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-foreground">
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20 text-center md:px-10">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px circle at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground md:text-5xl">
            Run your gym smarter.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-text-secondary">
            GymPilot brings members, memberships, payments, attendance, and trainers into one
            place, with analytics that show you what&rsquo;s working — and an AI assistant that
            answers your questions in plain language, grounded in your own data.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className={PRIMARY_CTA}>
              Get started
            </Link>
            <Link href="/login" className={SECONDARY_CTA}>
              Sign in
            </Link>
          </div>
        </div>

        {/* Product preview mockup — illustrative only, not live data */}
        <div className="relative mx-auto mt-16 max-w-3xl">
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1 shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/50" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
              <span className="ml-3 text-xs text-text-tertiary">GymPilot — Dashboard</span>
            </div>
            <div className="p-5 md:p-6">
              <div className="grid grid-cols-3 gap-3">
                <MockStat label="Active members" value="248" tone="accent" />
                <MockStat label="Revenue" value="4,920 TND" tone="success" />
                <MockStat label="Check-ins" value="612" tone="accent" />
              </div>
              <div className="mt-3 h-20 rounded-lg border border-border-subtle bg-surface-2 p-3 md:h-28">
                <svg viewBox="0 0 200 60" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points="0,50 30,42 60,45 90,25 120,30 150,14 180,20 200,8"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-text-tertiary">
            Sample data shown for illustration — not live figures.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 md:px-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Everything your gym needs
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border-subtle bg-surface-2 p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft-bg text-accent">
                  <feature.icon className="h-4.5 w-4.5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border-subtle px-6 py-16 text-center md:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Ready to run your gym smarter?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Sign in to your GymPilot account to get started.
        </p>
        <div className="mt-6">
          <Link href="/login" className={PRIMARY_CTA}>
            Sign in
          </Link>
        </div>
      </section>

      <footer className="border-t border-border-subtle px-6 py-6 text-center text-xs text-text-tertiary md:px-10">
        GymPilot
      </footer>
    </main>
  );
}

function MockStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "success";
}) {
  const toneClass = tone === "accent" ? "bg-accent-soft-bg text-accent" : "bg-success-bg text-success-text";
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
      <p className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${toneClass}`}>
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
