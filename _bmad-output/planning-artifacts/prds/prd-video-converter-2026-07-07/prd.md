---
title: "PRD: MP3 Audio Extraction Mode"
status: final
created: 2026-07-07
updated: 2026-07-07
---

# PRD: MP3 Audio Extraction Mode

## 0. Document Purpose
This PRD defines a small, hobby-scope enhancement for VideoForge: extracting audio-only MP3 files from uploaded video files. It is intended for PM-to-dev handoff and later decomposition into epics and stories. Assumptions are tagged inline and indexed in Section 9.

## 1. Vision
VideoForge should let a user upload a screencast video and quickly produce an MP3 they can reuse in other workflows (transcription, notes, publishing, editing) without keeping the heavier video file in that workflow.

The feature should feel like a natural extension of the existing converter, with minimal additional complexity: choose an audio extraction mode, convert, and save.

## 2. Target User

### 2.1 Jobs To Be Done
- Convert screencast videos into audio-only files for downstream use.
- Reduce working file size by moving from video to MP3 where video is not needed.
- Complete conversion and save locally in one flow without advanced settings.

### 2.2 Non-Users (v1)
- Users needing professional-grade mastering controls.
- Users needing batch conversion of many files at once.
- Users needing non-MP3 audio outputs in v1.

### 2.3 Key User Journeys
- **UJ-1. Timmy extracts MP3 from a screencast.**
	- **Persona + context:** Timmy records screencasts and wants only speech audio for follow-up work.
	- **Entry state:** Timmy opens VideoForge and has a local video file ready.
	- **Path:** Timmy selects audio extraction mode, uploads the video, starts conversion, waits for progress completion.
	- **Climax:** Timmy receives an MP3 output and can save it locally.
	- **Resolution:** Timmy continues work using the MP3 instead of the original video.

## 3. Glossary
- **Source Video** - The uploaded video file used as input for conversion.
- **Audio Extraction Mode** - A converter mode focused on generating audio-only output from video input.
- **MP3 Output** - The produced audio file in `.mp3` format.
- **Conversion Job** - One end-to-end processing run from upload to output generation.
- **Local Save** - Persisting the generated MP3 via any supported runtime save path.

## 4. Features

### 4.1 Audio Extraction Mode
**Description:** The converter provides an Audio Extraction Mode optimized for "video in -> MP3 out" with a minimal decision surface. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Select audio extraction mode

User can switch converter behavior to Audio Extraction Mode before conversion. Realizes UJ-1.

**Consequences (testable):**
- UI exposes a clear mode state indicating audio extraction is active.
- When active, output target is constrained to MP3 for v1.
- Mode selection stays explicit and is not auto-switched only by choosing MP3.

#### FR-2: Upload source video for audio extraction

User can provide a supported Source Video and prepare it for conversion in Audio Extraction Mode. Realizes UJ-1.

**Consequences (testable):**
- The system accepts the same supported video input family already accepted by the converter.
- Invalid or unreadable files produce a user-visible error state.

#### FR-3: Convert source video to MP3 output

User can run one Conversion Job that extracts audio from the Source Video and produces MP3 Output. Realizes UJ-1.

**Consequences (testable):**
- Successful runs produce exactly one MP3 Output file.
- Conversion progress and completion state are visible.
- If conversion fails, user receives an actionable error state.

**Out of Scope:**
- Multi-output conversion from one run.
- Advanced codec parameter editing in v1.

### 4.2 Save MP3 Output
**Description:** After a successful conversion, the user can save MP3 Output through existing runtime-appropriate save behavior. Realizes UJ-1.

**Functional Requirements:**

#### FR-4: Save generated MP3 locally

User can save MP3 Output locally after conversion completes. Realizes UJ-1.

**Consequences (testable):**
- Save action is available after successful conversion.
- Save works across supported app runtimes via existing save capability paths.

#### FR-5: Name output with audio suffix

System generates MP3 Output filename with `_audio` suffix before `.mp3` extension. Realizes UJ-1.

**Consequences (testable):**
- Output filename follows pattern `<source-name>_audio.mp3`.
- Filename behavior is consistent across save paths.

#### FR-6: Use a default quality profile for v1

System uses CBR 320 kbps MP3 encoding with no user-facing tuning controls in v1. Realizes UJ-1.

**Consequences (testable):**
- No bitrate/sample-rate selector is exposed in v1 UI.
- Encoder target bitrate is fixed at 320 kbps for v1.

**Notes:**
- Existing video-cropping controls are hidden or disabled when Audio Extraction Mode is active.

## 5. Non-Goals (Explicit)
- Non-MP3 audio formats (WAV, AAC, FLAC) in v1.
- Batch extraction for multiple videos in one action.
- Built-in audio editing (trim, normalize, denoise, chapter split).
- Metadata editing/tagging in v1.

## 6. MVP Scope

### 6.1 In Scope
- Add Audio Extraction Mode to the existing converter experience.
- Support single-file video-to-MP3 Conversion Job.
- Preserve existing progress, success, and error feedback patterns.
- Enable Local Save for MP3 Output through existing runtime save paths.

### 6.2 Out of Scope for MVP
- User-configurable quality controls. Deferred to a future iteration.
- Additional audio output formats. Deferred to a future iteration.
- Queueing and batch processing. Deferred to a future iteration.

## 7. Success Metrics

**Primary**
- **SM-1:** User can complete Source Video upload -> MP3 conversion -> Local Save in one uninterrupted flow. Validates FR-1, FR-2, FR-3, FR-4.

**Secondary**
- **SM-2:** For typical screencast inputs, MP3 Output file size is materially lower than Source Video size while speech remains usable. Validates FR-3, FR-6.

**Counter-metrics (do not optimize)**
- **SM-C1:** Do not optimize for smallest possible file size if speech intelligibility degrades noticeably. Counterbalances SM-2.

## 8. Open Questions
No open MVP blockers. Accepted defaults on 2026-07-07:
1. MP3 profile: CBR 320 kbps.
2. Mode behavior: explicit Audio Extraction mode toggle.
3. Output naming: `_audio.mp3` suffix.

## 9. Assumptions Index
No unresolved assumptions.
