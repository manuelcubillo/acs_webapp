# Module: scanning

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Everything about getting a `code` from a physical device into the app: camera QR scanning, USB/Bluetooth HID reader detection, scan mode configuration, and the distinction between operational scans and informational consultations.

Does not own action execution (see `actions`) or card resolution (see `cards`).

## Key files

### Operational scan surfaces (dashboard)

- `src/components/dashboard/DashboardView.tsx` — **Primary operational scan surface.** On code received (from `DashboardSearchBar` or `useExternalScanner`), calls `executeScanWithAutoActionsAction(code)`. Displays result in `ActiveCardZone`.
- `src/components/dashboard/DashboardSearchBar.tsx` — Manual code input + external reader. Focused on mount. Calls `onScan(code)` → `DashboardView`.
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

Entry: `DashboardSearchBar` (manual input or external reader keystroke captured there) or `useExternalScanner` mounted in `DashboardView`.

1. Code received → `DashboardView.onScan(code)` → `executeScanWithAutoActionsAction(code)`.
2. Full pipeline in `src/lib/actions/cards.ts`: log scan entry, evaluate validations, run auto-actions sequentially, re-validate after each (see `modules/actions.md`).
3. Result (`ScanWithAutoActionsResult`) displayed in `ActiveCardZone`: card details, auto-action feedback, manual action buttons.
4. If `pausedForConfirmation=true`, override modal appears → operator confirms → `resumeAutoActionsAction`.
5. Entry visible in the activity feed.

**The `/cards/scan` page is NOT the operational path.** See below.

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

- 2026-04-19 — Initial extraction.
- 2026-04-19 — Synchronized documentation against source code: completely corrected operational scan flow (dashboard, not /cards/scan); added DashboardView/DashboardSearchBar as primary operational surfaces; clarified /cards/scan as informational; added resumeAutoActionsAction cross-reference.
