# Module: scanning

**Last updated**: 2026-08-30 · **Last feature**: the dashboard scan field keeps focus and QUEUES codes read while it is busy

## Responsibility

Everything about getting a `code` from a physical device into the app: camera QR scanning, USB/Bluetooth HID reader detection, scan mode configuration, and the distinction between operational scans and informational consultations.

Does not own action execution (see `actions`) or card resolution (see `cards`).

## Key files

### Operational scan surfaces (dashboard)

- `src/components/dashboard/DashboardView.tsx` — **Primary operational scan surface.** On code received from `DashboardSearchBar`, calls `executeScanWithAutoActionsAction(code)`. Displays result in `ActiveCardZone`. ⚠️ It does **not** mount `useExternalScanner` — the dashboard has no global HID listener.
- `src/components/dashboard/DashboardSearchBar.tsx` — Manual code input + external reader. Calls `onScan(code)` → `DashboardView`. **Its focus IS the dashboard's reader support**: an HID reader types wherever focus is, and nothing else on this route listens. So the field is never `disabled` and never `readOnly` — it stays writable and focused throughout — and one `useEffect` keyed on `isScanning || isBlocked` both refocuses (after React commits, which is why it cannot live in `handleSubmit`'s continuation) and drains the scan queue.
  **Owns the scan queue**: a code read while the dashboard is busy is pushed to `queueRef` instead of being dropped, and drained one at a time as each scan completes. `isBlocked` (from `DashboardView`) holds the drain while a confirmation modal, a resume, or a manual action is pending.
- `src/lib/actions/cards.ts` — `executeScanWithAutoActionsAction` (log + auto-actions), `resumeAutoActionsAction` (override continuation). See `modules/actions.md` for full pipeline.

### Informational scan page (/cards/scan)

- `src/app/(dashboard)/cards/scan/page.tsx` — Reads tenant `scan_mode`. OPERATOR+. Entry navigates to `/cards/[code]` (informational — no log, no auto-actions).
- `src/app/(dashboard)/cards/scan/ScanClient.tsx` — `QRScanner` + `useExternalScanner`. On scan: `router.push(/cards/${code})`.
- `src/components/cards/scanner/QRScanner.tsx` — `html5-qrcode` wrapper. Loaded with `dynamic(..., { ssr: false })`.
- `src/components/cards/scanner/ScannerOverlay.tsx` — Viewfinder UI.

### Hooks

- `src/hooks/useQRScanner.ts` — html5-qrcode lifecycle: dynamic import, `facingMode: "environment"`, `fps: 10`, `qrbox: 250×250`.
- `src/hooks/useExternalScanner.ts` — HID barcode reader via `keydown` timing. `THRESHOLD_MS = 50ms` between chars (scanner); `MIN_LENGTH = 4`. Enter flushes buffer. Human input resets buffer. Used by both `DashboardView` (operational) and `ScanClient` (informational).
- `src/hooks/useScanMode.ts` — Derives `showCamera` / `showExternalReader` from `ScanMode`.

### Settings

- `src/app/(dashboard)/settings/reader/page.tsx` — Scanner device mode selector (OPERATOR+ to read, MASTER to change).
- `src/components/settings/reader/ReaderSettings.tsx` — UI for scan mode selection.

## Data model (relevant subset)

- `tenants.scan_mode` — `camera | external_reader | both`.
- `action_logs` with `log_type='scan'` — only written on **operational** scans.

## Main flows

### Operational scan flow (dashboard)

Entry: `DashboardSearchBar` only — manual input or external reader keystrokes, both captured by its focused input. There is no `useExternalScanner` on this route.

1. Code received → `DashboardView.onScan(code)` → `executeScanWithAutoActionsAction(code)`.
2. Full pipeline in `src/lib/actions/cards.ts`: log scan entry (always, even for an archived card), evaluate the **lifecycle gate** (phase 2, see `modules/cards.md`) and scan validations, run auto-actions sequentially, re-validate after each (see `modules/actions.md`).
3. A code read while a scan is in flight is QUEUED, not dropped — see "Scan queue" below. Result (`ScanWithAutoActionsResult`, now carrying `lifecycleGate`) displayed in `ActiveCardZone`: card details, auto-action feedback, manual action buttons. Off-state → orange (`--state-override`) surface; archived → red denial, no actions.
4. If `pausedForConfirmation=true` (blocking scan validations **or** an inactive/expired card with override allowed), the override modal appears → operator confirms → `resumeAutoActionsAction`. Archived never opens the modal.
5. Entry visible in the activity feed.

**The `/cards/scan` page is NOT the operational path.** See below.

### Scan queue (dashboard)

Scans are sequential — one `activeCard`, one in-flight request — but a reader is
not: at a busy door the next card is read before the previous round trip lands.
Those reads used to hit an `isScanning` guard and vanish, which at a door means a
person walked through unlogged.

`DashboardSearchBar` therefore pushes a code onto `queueRef` whenever it is busy,
and its idle effect drains exactly ONE per transition back to idle. Each drained
scan flips `isScanning` true → false again, which re-runs the effect and takes
the next — so a burst executes in order, never concurrently. The queue is FIFO
and uncollapsed on purpose: dropping the middle of a burst is the same silent
loss the queue exists to fix. Depth is shown in the hint bar (`aria-live`).

⚠️ **The drain is gated on `isBlocked`, and that gate is not cosmetic.**
`DashboardView` sets it while a confirmation modal is open, a resume is running,
or a manual action is executing. All of those flows read `activeCard`, and
`handleAutoActionResume` is the sharp case: it resumes the PAUSED scan's
`pendingAutoActionIds` against `activeCard.code`, so a queued scan firing between
the modal opening and the operator confirming would run card A's pending actions
on card B.

Implementation notes: the queue is a **ref** (state only mirrors its depth for
display) so it stays out of the drain effect's dependencies — an effect re-running
on every queue mutation could drain twice for one completed scan and put two scans
in flight. `onScan` is held in a ref for the same reason. And `handleSubmit`
clears the input BEFORE awaiting, never after: a post-await clear wipes the next
burst mid-code and submits a truncated one.

### Informational scan page (/cards/scan)

1. Operator opens `/cards/scan`. Camera or external reader captures a code.
2. `ScanClient` calls `router.push(`/cards/${code}`)`.
3. Card detail page (`/cards/[code]`) loads — **always informational** (no log, no auto-actions).
4. Scan validations shown (read-only advisory).
5. Entry does **not** appear in the activity feed.

This may seem counterintuitive — a page called "scan" that is informational. The choice is intentional: the dedicated scan page is a convenience for looking up a card by scanning its code, not a checkpoint that should trigger real-world effects. See `decisions/2026-03-20-operational-vs-informational.md` for rationale.

### Informational consultation flow (any other path)

Any navigation to `/cards/[code]` that is not from an operational scan: direct URL, card list click, search result. Same behavior as the scan page: no log, no auto-actions, scan validations shown.

### Scan mode resolution

- `useScanMode(scanMode)` returns `{ showCamera, showExternalReader }`.
- `camera` → camera only.
- `external_reader` → external reader only (no camera button).
- `both` → both simultaneously. The external reader detection is always listening globally while the scan page is active.

### External reader detection heuristic

Keystrokes arriving faster than `THRESHOLD_MS` (50ms) between characters are classified as scanner input. Slower sequences are human typing and are ignored for scan purposes. An `Enter` keystroke flushes the buffer to `onScan(code)`. If `MIN_LENGTH` (4) is not met when `Enter` arrives, the buffer is discarded.

## Extension points

- **New scanner type** → add a hook, wire into both `ScanClient` (informational) and `DashboardView` (operational), add mode enum value, update settings UI.
- **New operational post-scan behavior** → extend `executeScanWithAutoActionsAction` in `src/lib/actions/cards.ts`. Do not touch the `/cards/scan` page.
- **Global reader listening on more pages** → mount `useExternalScanner` at the dashboard shell level only after explicit design review; current decision keeps listening scoped to scan-enabled pages.

## Module interactions

- This module describes the **input surfaces** (hooks, scanner UI, scan page, dashboard bar).
- Operational pipeline owned by `cards` (`executeScanWithAutoActionsAction`, `resumeAutoActionsAction`) → triggers `actions` (auto-action execution).
- Reads: `cards` (resolve code → card), `auth-tenants` (scan mode setting).
- Writes to: `action_logs` — only on the operational path, via `logScanEntry` inside `executeScanWithAutoActionsAction`.
- Feeds: `dashboard` (activity feed) — operational scans only.

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-08-30 — **Codes read during a scan are queued, not dropped.** The `isScanning` early-return in `handleSubmit` discarded them; at a door that is an unlogged entry. `DashboardSearchBar` now holds a FIFO `queueRef`, drains one code per return to idle, and shows the depth in the hint bar. The input lost its `readOnly` too — it was swallowing the very characters the queue needs. New `isBlocked` prop from `DashboardView` (`showAutoActionModal || isResumingAutoActions || showManualActionModal || isConfirmingManualAction || isExecutingActionId !== null`) holds the drain while those flows own `activeCard`; without it a queued scan could land between an override modal opening and the operator confirming, and the resume would run the paused card's actions against the new one. Verified live: three codes dispatched in one tick produced exactly three scan rows, 140 ms apart, in order. No ADR — extends the fix below.
- 2026-08-30 — Fixed: the dashboard code field lost focus after every barcode read, so the next scan was silently dropped. Root cause: the input was `disabled={isScanning}`; a disabled control cannot hold focus, so the browser blurred it the moment `setIsScanning(true)` committed inside the keydown event. The existing `inputRef.current?.focus()` in `handleSubmit` never helped — it runs in the promise-resolution microtask, before React's normal-lane commit of `isScanning: false` re-enables the input. Now `readOnly` + `aria-busy` (focusable, still receives keydown, reader chars stay out of the value), the re-entrant submit blocked by the `isScanning` guard already in `handleSubmit`, and the refocus moved to a `useEffect` keyed on `isScanning`. Also corrected here: this module claimed `useExternalScanner` was mounted in `DashboardView`; it never was. No ADR — bug fix.
- 2026-07-17 — Phase-2 scan behaviour by status: the operational scan now evaluates `resolveLifecycleGate` after logging. Archived → hard denial (no auto-actions, scan still logged); inactive/expired → override pause / block via a synthetic scan check. The `/cards/scan` informational path is unchanged (still no log, no actions). ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-04-19 — Initial extraction.
- 2026-04-19 — Synchronized documentation against source code: completely corrected operational scan flow (dashboard, not /cards/scan); added DashboardView/DashboardSearchBar as primary operational surfaces; clarified /cards/scan as informational; added resumeAutoActionsAction cross-reference.
