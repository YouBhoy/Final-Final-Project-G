# FOREST_PERIOD_FILTER_AUDIT.md

**Audit date:** 2026-09-23
**Repo root:** `c:\xampp\htdocs\Final-Final-Project-G`
**Scope:** Read-only audit of how the Forest screen decides which assessment
attempts/trees belong to the selected Day/Week/Month/Year period, and why a
period with no submitted assessment (e.g. September) can still render trees.
**No code was modified.**

**Bug report being audited:** *Trees exist for August; switching to September
(where no assessment was taken) still shows some tree(s) instead of an empty
forest.*

**Headline finding (root cause):**
The island **always renders the WHOLE forest**. `ForestScreen` passes the full
`previewCheckIns` list to `ForestIsland`; the period filter
(`periodCheckIns`) is used only for the **stats / chart / subtitle / empty-text**,
and `isInPeriod` merely **dims** off-period trees (opacity 0.42) — it never
removes them. So an empty period still draws every tree from other periods,
just faded, which is exactly the reported symptom. The period *filter itself is
correct*; the bug is that **tree rendering ignores the filter**.

---

## 1. Chain: tab press → what gets rendered

**`PeriodTabs` (presentational) → `ForestScreen` state → `ForestIsland`**

`spartan-g/apps/mobile/src/screens/student/components/forest/PeriodTabs.tsx`:
- `PeriodTabs` is wired to two callbacks (`ForestScreen.tsx:438-444`):
  ```tsx
  <PeriodTabs
    mode={mode}
    range={range}
    onModeChange={changeMode}   // tab tap
    onShift={shift}             // ‹ / › arrows
    canGoForward={canGoForward}
  />
  ```
  Tab taps call `onModeChange(item)` (`PeriodTabs.tsx:52`); arrows call
  `onShift(±1)` (`PeriodTabs.tsx:41-42, 68, 80`).

- **`ForestScreen.tsx:306-309` — `changeMode`** (tab press):
  ```tsx
  const changeMode = useCallback((next: PeriodMode) => {
    setMode(next);
    setAnchor(new Date());      // reset anchor to *now* whenever switching mode
  }, []);
  ```
- **`ForestScreen.tsx:302-305` — `shift`** (arrow press):
  ```tsx
  const shift = useCallback(
    (direction: number) => setAnchor((current) => shiftPeriod(mode, current, direction)),
    [mode],
  );
  ```

- **`ForestScreen.tsx:102` — the selected period range** (derived from mode+anchor):
  ```tsx
  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor]);
  ```

- **Two separate downstream consumers** of that range:
  - `periodCheckIns` (filtered list) → **stats / chart / subtitle / empty text**
    (`ForestScreen.tsx:178-207, 410-414, 492-530`).
  - `islandForPeriod` (a predicate) → passed as `isInPeriod` into the island,
    which only sets a **dim** flag on each tree (`ForestIsland.tsx:334`).

- **⚠️ The island's actual tree list is NOT filtered.** `ForestScreen.tsx:480`:
  ```tsx
  <ForestIsland
    checkIns={previewCheckIns}   // ← the FULL list, every period, never filtered
    isInPeriod={islandForPeriod} // ← only used to DIM off-period trees
    ...
  />
  ```

So the chain is: tab → `changeMode` → `setMode` + `setAnchor(now)` → `range` →
→ (`periodCheckIns` for text/stats) **and** (`previewCheckIns` for the island).
The island branch of that chain is the one exhibiting the bug.

---

## 2. Exact filter logic — is it date-based or a fallback/cache?

The period membership filter is **date-based and correct** — it is **not** "most
recent N" and **not** a stale cache in the real-data path.

`ForestScreen.tsx:178-182`:
```tsx
const periodCheckIns = useMemo(() => {
  const start = range.start.getTime();
  const end = range.end.getTime();
  return previewCheckIns.filter((c) => c.date.getTime() >= start && c.date.getTime() < end);
}, [previewCheckIns, range]);
```
- Half-open interval `[start, end)`, matching `PeriodRange` (`end` is exclusive).
- `previewCheckIns` is derived from **live loaded state** (`checkIns`), not a
  stale per-period list:
  ```tsx
  const previewCheckIns: ForestCheckIn[] = useMemo(
    () => (previewKey === 'real' ? checkIns : previewFor(previewKey)),
    [previewKey, checkIns],
  );
  ```
  In real mode (`previewKey === 'real'`) it is just `checkIns`.

- Underlying data (each check-in's `date`) comes from the full history loaded by
  `load()` → `assessmentService.getAttemptsByStudent(session.uid)`
  (`ForestScreen.tsx:104-136`), which returns **all submitted/graded attempts**
  for the student (`assessment.service.ts:147-159`), sorted by `submittedAt`
  desc. No "take only recent N" anywhere.

- The `isInPeriod` predicate used by the island is the **same correct date test**:
  `ForestScreen.tsx:258-263`:
  ```tsx
  const islandForPeriod = useCallback(
    (checkIn: ForestCheckIn) =>
      checkIn.date.getTime() >= range.start.getTime() &&
      checkIn.date.getTime() < range.end.getTime(),
    [range],
  );
  ```

**Conclusion:** the *filtering* is genuinely by date and correct. The bug is not
in this query; it is that the island ignores the (full) list vs the (filtered)
predicate distinction and only dims.

---

## 3. Which date field is used

The field used for period membership is **`submittedAt`** — the actual time the
assessment was submitted — confirmed to be the right field, not `createdAt` or
`startedAt`.

- `buildForestCheckIns` records the date bucket (`forestUtils.ts:139`):
  ```ts
  const date = toDate(attempt.submittedAt);
  ```
  and returns that `date` on the `ForestCheckIn` (`forestUtils.ts:173-184`), which
  is what `periodCheckIns` / `islandForPeriod` compare.
- `toDate` (`forestUtils.ts:87-98`) unwraps a Firestore `Timestamp` via
  `.toDate()`/`.toMillis()`.
- Schema confirms `submittedAt` is the submission timestamp
  (`shared-types/.../types/assessment.types.ts:52`, and service writes it on
  submit, `assessment.service.ts:307`).
- `getAttemptsByStudent` only returns `status in ['submitted','graded']`
  (`assessment.service.ts:150`) — i.e., completed attempts that carry a real
  `submittedAt`.

**Secondary edge case worth noting (not the reported bug):** `toDate` falls back
to `new Date()` (i.e. *now*) when it can't read a timestamp
(`forestUtils.ts:91-97`). So an attempt that somehow had no `submittedAt` would
be treated as "submitted right now" and always land in the current period. This
is a latent edge case, not the cause of the August→September symptom (the
offending trees are submitted, dated attempts).

---

## 4. Period boundary math / timezone / off-by-one

`forestUtils.ts:242-286` (`periodRange` + `shiftPeriod`) — all boundaries are
computed in the **device's local timezone** (there is no explicit tz handling).

```ts
// day   — local midnight → midnight + 24h
const start = startOfDay(anchor);            // new Date(y, m, d)
const end   = new Date(start.getTime() + 86400000);
// week  — Monday-based, local midnight, +7 days
const start = startOfDay(anchor);
const dow = (start.getDay() + 6) % 7;        // Mon=0
start.setDate(start.getDate() - dow);
const end = new Date(start.getTime() + 7 * 86400000);
// month — calendar month local: [1st 00:00, 1st of next month 00:00)
const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
const end   = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
// year  — local Jan 1 → Jan 1 next year
const start = new Date(anchor.getFullYear(), 0, 1);
const end   = new Date(anchor.getFullYear() + 1, 0, 1);
```

- Calendar-month/week/day boundaries are correct local-time ranges. The period
  filter compares epoch ms (`getTime()`), so membership is the absolute instant
  vs these local boundaries — consistent, though it means "September" depends on
  the observer's local timezone.
- **Off-by-one risk in arrow navigation (`shiftPeriod`), `forestUtils.ts:279-286`:**
  ```ts
  if (mode === 'month') d.setMonth(d.getMonth() + dir);
  ```
  `shiftPeriod` copies the anchor's **absolute time** (`new Date(anchor.getTime())`)
  and then does calendar arithmetic with `setMonth`/`setDate`. If the anchor's
  day-of-month exceeds the target month's length, JS rolls over. Example: anchor
  = **Aug 31 2024 14:30** → `setMonth(+1)` → Sep 31 doesn't exist → **Oct 1 2024**.
  So tapping "next month" while anchored on the 31st **skips September entirely**.
  The same rollover applies to `mode === 'week'` at DST-gap weeks and `day` at
  daylight-saving transitions (24h additions can straddle local-midnight DST
  shifts).
- This rollover is a **secondary contributor**: it can land the user on the wrong
  month label, but the *visible trees* symptom is fully explained by §1 (whole
  forest + dim) regardless of which month the anchor ends up on.

---

## 5. Caching / memoization / stale state

**Real-data path: no stale per-period cache.** `previewCheckIns` derives from the
live `checkIns` state (`ForestScreen.tsx:171-174`), which is reloaded on mount and
on focus via `useFocusEffect` → `load()` (`ForestScreen.tsx:139-143, 104-136`).
Changing `mode`/`anchor` recomputes `range` → `periodCheckIns` and `islandForPeriod`
via `useMemo` keyed on the right dependencies (`[previewCheckIns, range]`, `[range]`).
The island list `previewCheckIns` is intentionally the full history.

**Dev-only mock cache exists but is irrelevant to real data:** `forestMocks.ts:102-118`
caches the synthetic preview datasets (`previewCache`) once. This is only used when
in the reported bug.

---

## 6. Empty-state text vs tree rendering — driven by different data

Yes — they are driven by **two different datasets**, which is exactly why an
empty-state message and a visible tree can appear at the same time.

- **TEXT/empty hint — uses the FILTERED `periodCheckIns`** (`ForestScreen.tsx:492-496`):
  ```tsx
  {periodCheckIns.length === 0 && previewCheckIns.length > 0 && (
    <Text style={styles.emptyHint}>
      No check-ins in {range.label} yet. Complete one to plant a tree here.
    </Text>
  )}
  ```
  For an empty September this is `true` (0 attempts in September, >0 in the whole
  forest) → **shows the "No check-ins in September yet" text**.
  The header subtitle uses the same filtered count (`ForestScreen.tsx:410-414`),
  so it would say "0 trees in September".
- **Island — uses the FULL `previewCheckIns`** (`ForestScreen.tsx:480`), with each
  off-period tree merely dimmed to opacity `0.42` (`ForestIsland.tsx:334` →
  `ForestTree.tsx:443`):
  ```tsx
  {/* ForestIsland.tsx:334 */}
  dimmed={!isInPeriod(checkIn)}
  {/* ForestTree.tsx:443 */}
  opacity: dimmed ? 0.42 : 1,
  ```
- The "Your island is waiting / Complete a check-in…" empty card
  (`ForestScreen.tsx:500-516`) only appears when the **whole** forest is empty
  (`previewCheckIns.length === 0`), i.e. it never appears for a *period* that is
  empty but whose overall forest isn't.

Net effect in the reported scenario: the screen can simultaneously show
(1) "0 trees in September" / "No check-ins in September yet" **and**
(2) the full August forest, faded. This is the precise, reproducible contradiction.

---

## 7. Reproduction + confirmed root cause

**Reproduction conditions (exact):** any student who has ≥1 submitted assessment
in *some* period and **0 in the selected period**. Concretely, the August/September
case: attempts dated in August, then navigate the period control to September
(0 attempts). Because `ForestIsland` receives the full `previewCheckIns` and
off-period trees are only dimmed (not removed/hidden), **the August trees remain
visible** on the September view while the header/hint correctly report "0 trees".

I could not query the live Firestore, but the deterministic behaviour is fully
established from the code, and it matches the report exactly. (The dev "twelve"
preview also reproduces the same whole-forest-with-dim behaviour when you move to
an older/other period outside the ~40-day spread.)

**Priority-ordered root-cause chain:**
1. **Primary (the bug):** the island is fed the **unfiltered** full list
   (`ForestScreen.tsx:480`) and `isInPeriod` only dims (`ForestIsland.tsx:334`).
   There is **no "empty the island per period" path** — the island never becomes
   empty for an empty period. The empty-state *text* is correct and independent,
   so both message and trees display together.
2. **Secondary (navigation):** `shiftPeriod` month arithmetic can roll the anchor
   past the intended month when the anchor day > target month length (Aug 31 →
   next = Oct 1), so the wrong month can be shown at all — compounding confusion.
3. **Latent (not this report):** `toDate` maps a missing `submittedAt` to "now",
   which would surface any undated attempt in the current period.

**Fix direction (NOT implemented — audit only):** feed the island `periodCheckIns`
(or gate each tree's visibility, not just opacity, on `isInPeriod`) when an empty
period should render as an empty plot — while deciding the intended UX (the current
comments explicitly say "the island always shows the WHOLE forest (stable spiral)",
so this "bug" may actually be an intentional design whose *text* was written to
contradict it). Recommended next step: confirm intended UX with the product owner,
then either (a) hide/don't-render off-period trees so an empty period is truly
empty, or (b) change the header/hint copy to not claim a per-period count while the
island shows the whole forest.