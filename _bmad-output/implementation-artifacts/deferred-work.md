# Deferred Work

- source_spec: `spec-streaming-transcript-display.md`
  summary: HF hosted Inference API transcription (openai/whisper-large-v3) with bring-your-own-token UI and automatic fallback to the local whisper worker.
  evidence: Split from the streaming-transcript work (Story B); user chose to sequence streaming display first, then hosted. Depends on Story A's per-segment streaming plumbing for progressive display.
- source_spec: `_bmad-output/implementation-artifacts/spec-ai-transcript-polish.md`
  summary: Guard the video/audio-extraction transcode completion and error setJob writes against reset-during-await resurrection (the runId guard added for transcription covers only that branch).
  evidence: Pre-existing race surfaced by adversarial review — reset() during an in-flight transcode lets the completion write resurrect the job as 'done' with an orphaned blob URL; same class as the transcription races fixed in this story.
