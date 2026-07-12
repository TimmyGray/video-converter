# Deferred Work

- source_spec: `spec-streaming-transcript-display.md`
  summary: HF hosted Inference API transcription (openai/whisper-large-v3) with bring-your-own-token UI and automatic fallback to the local whisper worker.
  evidence: Split from the streaming-transcript work (Story B); user chose to sequence streaming display first, then hosted. Depends on Story A's per-segment streaming plumbing for progressive display.
