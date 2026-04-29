# Agent Learnings

## Log

### 2026-04-29 — Test used clamped max start value

**Trigger:** Test failure
**Context:** Updated custom crop inputs to percentage mode with max=100 and clamped drag scrubbing in [src/components/CropSelector.tsx](src/components/CropSelector.tsx).
**Wrong action:** Kept scrub test start value at width=100 and expected an increase event.
**Root cause:** I changed runtime constraints (clamp to 100) but did not recalculate test setup, so the drag delta produced no state change and no callback.
**Correct behavior:** When constraints/clamping are introduced, seed test values inside movable range and update expected delta outputs.
**Pattern / trigger:** Any UI control that clamps min/max values and has drag/step behavior.
**Generalize?:** Yes

### 2026-04-29 — Save button gated without desktop fallback

**Trigger:** User correction
**Context:** Save dialog destination flow in [src/components/SaveDestinationDialog.tsx](src/components/SaveDestinationDialog.tsx) while running in a browser/webview without File System Access API.
**Wrong action:** Disabled Choose Destination solely on browser picker support (and Tauri runtime), leaving no active path in unsupported browsers.
**Root cause:** I assumed desktop-native save would only be needed via Tauri and did not account for the browser release variant using a local Node server.
**Correct behavior:** Capability gating must include all runtime save paths (browser picker, Tauri native, and local server native dialog) before disabling primary actions.
**Pattern / trigger:** Feature support checks in multi-runtime apps where web, desktop wrapper, and local server modes coexist.
**Generalize?:** Yes

### 2026-04-29 — Route segment config must be static in export mode

**Trigger:** Test failure
**Context:** Desktop web export build (`npm run build:desktop:web`) for [src/app/api/native-save/route.ts](src/app/api/native-save/route.ts).
**Wrong action:** Exported `dynamic` using a runtime conditional expression.
**Root cause:** I applied environment-based branching to a route segment config that Next requires to be statically analyzable at compile time.
**Correct behavior:** Keep route segment config exports (`dynamic`, `revalidate`, etc.) as static literals and move environment conditionals into handler logic.
**Pattern / trigger:** Next App Router route handlers when targeting `output: export` and adjusting segment config for build compatibility.
**Generalize?:** Yes

### 2026-04-29 — Move handle matched resize branch by substring

**Trigger:** User correction
**Context:** Crop rectangle dragging in [src/components/CropPreviewPanel.tsx](src/components/CropPreviewPanel.tsx).
**Wrong action:** Used `handle.includes('e'|'w'|'n'|'s')` checks for resize logic while move handle value was `move`.
**Root cause:** I treated handle names as safe substring tokens instead of explicit enum-like values, so `move` incorrectly matched the east-resize condition.
**Correct behavior:** Separate move and resize branches and use explicit handle matching sets (`e/ne/se`, `w/nw/sw`, etc.) for directional resize logic.
**Pattern / trigger:** Pointer/drag code that uses string handles and branches on substring checks.
**Generalize?:** Yes
