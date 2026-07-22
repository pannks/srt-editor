export const DEFAULT_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_CHUNK_SECS = 300;

export const DEFAULT_PROMPT = `Transcribe this audio into subtitle segments.

Rules:
- Transcribe exactly what is spoken, in the spoken language.
- Split into short subtitle-friendly segments: at most ~10 words or ~45 characters each.
- Break at natural phrase boundaries.
- "start" and "end" are seconds from the beginning of THIS audio clip, with millisecond precision.
- Segments must not overlap and must be in chronological order.
- Skip music and silence; do not invent words.
- Return ONLY a JSON array of {start, end, text} objects.`;
