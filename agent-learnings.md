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
