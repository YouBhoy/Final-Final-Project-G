# Branch Sync & Feature Parity Report

> **Compared:** `origin/main` (website) vs `origin/app` (mobile app)
> **Date:** August 26, 2026 · **Merge base:** `5a5a456`

---

## 1. Git Sync Status — ❌ NOT SYNCED (diverged in both directions)

| Branch | Commits not in the other | Author(s) | Content |
|---|---|---|---|
| `origin/app` | ~30 | jesus-justin, kurt | All mobile features: assessments, messaging, appointments, Garden/XP, AI Summary Generator, EAS build pipeline |
| `origin/main` | 9 | Jose Emmanuel Silva | Web features: campus system, real-time facilitator dashboard, student dashboard/profile pages, wizard question-nav dropdowns, unread message indicators, work-hours time format, `risk_alerts` composite index fix, profiles-document fix |

Both branches carry copies of **both** apps (`apps/web` and `apps/mobile` exist on each). Because they diverged:

> ⚠️ **Hidden consequence:** the website code inside the `app` branch is **older** than the website on `main`.
> On `app`, these real implementations are missing and fall back to generic/placeholder components:
>
> - `pages/student/StudentDashboardPage.tsx` (467 lines — deleted relative to main)
> - `pages/facilitator/FacilitatorDashboardPage.tsx` (332 lines)
> - `pages/student/StudentProfilePage.tsx` (208 lines)
> - `hooks/useStudentDashboard.ts` (279 lines), `hooks/useFacilitatorDashboard.ts` (233), `hooks/useConversationList.ts` (145)
>
> Conversely, `main` has **none** of the mobile work and lacks the AI Summary Generator even in its own web copy.
>
> Net effect: `git diff origin/main..origin/app -- apps/web` = **37 files changed, +596 / −2,234**; `-- packages` = **38 files changed, +1,117 / −290**.

Every day without a merge widens this gap — especially for `apps/web/**` and `packages/shared-*`, which both sides have modified.

---

## 2. Feature Parity Matrix — Web (`main`) vs Mobile (`app`)

| Feature | 🌐 Web (main) | 📱 Mobile (app) | Synced? |
|---|---|---|---|
| Login / Register | ✅ | ✅ | ✔️ |
| Forgot Password | ✅ page exists | ❌ deliberately removed (`11714c0`) | ⚠️ intentional |
| Student Dashboard | ✅ real-time dedicated page | ✅ shared generic screen | ⚠️ different quality |
| Facilitator Dashboard | ✅ real-time dedicated page | ⬜ generic screen | ⚠️ |
| Student Profile | ✅ dedicated page | ✅ 762-line screen (year/campus/college/course) | ✔️ |
| Find Facilitator → Book Appointment | ✅ | ✅ | ✔️ |
| Appointments | ✅ full management | ✅ list + booking; detail = ⬜ placeholder | ⚠️ |
| Assessments (take/wizard) | ✅ + question-nav dropdowns | ✅ `TemplateAssessmentScreen` (795 ln) | ✔️ parallel builds |
| Messaging (both roles) | ✅ | ✅ + unread indicators both sides | ✔️ |
| 🌱 Garden / XP gamification | ❌ | ✅ GardenScreen + tree + stat grid | 🔴 mobile-only |
| 🤖 AI Summary Generator | ❌ absent on main | ✅ mobile + app-branch web (`FacilitatorStudentsPage`) | 🔴 missing on main |
| Risk Alerts (facilitator) | ✅ page exists | ❌ removed from mobile tabs (`43c4899`) | 🔴 gap |
| Students management | ✅ | ✅ (+ AI summaries) | ✔️ |
| Work Hours / Slots | ✅ | ✅ | ✔️ |
| Campus system | ✅ (`e79b1df`) | ⚠️ partial — profile fields only (`f306439`) | 🔴 incomplete on mobile |
| Check-ins / Resources / Referrals | ⬜ placeholders | ❌ absent | 🔴 neither real yet |
| Super Admin portal (users/templates/settings) | ✅ | ❌ by design → "Web Portal Required" redirect | ✔️ by design |

**Parity estimate: ~70% aligned.** Core flows exist on both platforms via separate implementations sharing `packages/shared-services`. Real gaps: Garden/XP (mobile-only), AI Summaries (not on main), Risk Alerts & campus system (weak/missing on mobile); Check-ins/Resources/Referrals are unfinished everywhere.


---

## 3. Verdict

- **Functionally:** ~70% aligned. The two platforms are parallel implementations sharing one service layer — but Garden/XP, AI Summaries, Risk Alerts, and the campus system are not evenly distributed.
- **Git-wise:** actively diverging. `main` and `app` each hold work the other needs; the web copy inside `app` is already stale relative to `main`.

---

## 4. Recommended Sync Plan

### Step 1 — Sync `main` INTO `app` (do first; unblocks stale web code)

```powershell
git checkout app
git pull origin app
git merge origin/main
# Expect conflicts in:
#   apps/web/src/pages/**            (dashboards / profile / wizard)
#   apps/web/src/navigation/*Routes  (dedicated pages vs placeholders)
#   packages/shared-*                (types, services, theme)
npm install
npm run typecheck --workspaces
git push origin app
```

After merging: verify the dedicated dashboards/profile pages render again inside `app`'s web copy.

### Step 2 — Publish mobile to `main` (when ready to release)

```powershell
git checkout main
git merge app
git push origin main
```

This brings the mobile app, Garden/XP, and AI Summaries into the primary branch.

### Step 3 — Close the remaining feature gaps (either branch)

1. **Risk Alerts on mobile** — re-add a facilitator tab/screen reading `risk_alerts` (composite index fix is on `main`).
2. **Campus system on mobile** — extend student profile/facilitator screens to consume campus fields end-to-end.
3. **Garden/XP on web** — port `garden.types.ts` + Garden UI concepts to a student web page.
4. **AI Summaries into main's web** — comes free with Step 2's merge.
5. **Check-ins / Resources / Referrals** — scope and implement on both platforms or drop from nav configs.

---

*Related docs: `mobile-navigation-audit.md` (route inventory), `mobile-team-setup.md`, `web-mobile-feature-gap-analysis.md` (earlier phase).*

