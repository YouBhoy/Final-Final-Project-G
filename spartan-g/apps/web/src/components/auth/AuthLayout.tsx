import type { CSSProperties, ReactNode } from "react";
import { lightColors } from "@spartan-g/shared-ui";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const themeVars = {
    "--auth-primary": lightColors.primary,
    "--auth-primary-dark": lightColors.primaryDark,
    "--auth-surface": lightColors.surface,
    "--auth-background": lightColors.background,
    "--auth-text": lightColors.text,
    "--auth-text-secondary": lightColors.textSecondary,
  } as CSSProperties;

  return (
    <div
      className="min-h-screen overflow-hidden bg-[var(--auth-background)] text-[var(--auth-text)]"
      style={themeVars}
    >
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex items-center justify-center px-6 py-10 sm:px-8 lg:px-12 xl:px-16">
          <div className="w-full max-w-xl space-y-8">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-red-500/15 ring-1 ring-black/5">
                <img
                  src="/spartan-g-logo.png"
                  alt="SPARTAN-G"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--auth-primary)]">
                  SPARTAN-G
                </p>
                <p className="text-sm text-[var(--auth-text-secondary)]">
                  Mental Health App
                </p>
              </div>
            </div>

            {/* Header */}
            <div className="max-w-lg space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-[var(--auth-text)] sm:text-5xl">
                {title}
              </h1>
              {subtitle && (
                <p className="text-base leading-7 text-[var(--auth-text-secondary)] sm:text-lg">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Card */}
            <div className="w-full max-w-lg rounded-[2rem] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
              {children}
            </div>

            {/* Footer */}
            <p className="text-xs text-[var(--auth-text-secondary)]">
              &copy; {new Date().getFullYear()} SPARTAN-G. All rights reserved.
            </p>
          </div>
        </section>

        <aside className="relative isolate flex min-h-[320px] items-center overflow-hidden bg-[var(--auth-primary-dark)] px-6 py-10 text-white sm:px-8 lg:px-12 xl:px-16">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(145deg, ${lightColors.primaryDark} 0%, ${lightColors.primary} 100%)`,
            }}
          />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="absolute -right-10 top-10 h-40 w-40 rounded-full border border-white/25 bg-white/10 blur-[1px]" />
          <div className="absolute left-[-70px] top-1/2 h-56 w-56 -translate-y-1/2 rounded-full border border-white/20 bg-white/5" />
          <div className="absolute bottom-10 right-12 h-20 w-20 rounded-[2rem] border border-white/20 bg-white/10 rotate-12" />

          <div className="relative z-10 w-full max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
              Welcome to
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              SPARTAN-G
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/85 sm:text-lg">
              Your mental health and wellness companion. Access assessments, appointments, and guidance counseling support — all in one place.
            </p>

            <div className="mt-10 grid max-w-lg gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-sm font-semibold text-white">
                    01
                  </span>
                  <div>
                    <p className="font-medium text-white">Student services</p>
                    <p className="text-sm text-white/70">Bookings, records, and guidance.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-sm font-semibold text-white">
                    02
                  </span>
                  <div>
                    <p className="font-medium text-white">Quick access</p>
                    <p className="text-sm text-white/70">Sign in and continue right away.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-[2rem] border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-5">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] bg-white/95 p-3 shadow-lg shadow-black/10 ring-1 ring-black/5">
                  <img
                    src="/spartan-g-logo.png"
                    alt="SPARTAN-G"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/75">
                    SPARTAN-G
                  </p>
                  <p className="text-sm text-white/80 sm:text-base">
                    Guidance and Counseling Support
                  </p>
                  <p className="max-w-md text-sm leading-6 text-white/70">
                    A confidential space for students to access mental health screenings, book counseling appointments, and connect with facilitators.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}