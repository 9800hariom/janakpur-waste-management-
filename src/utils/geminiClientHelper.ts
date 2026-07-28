/**
 * Client-side utility helpers for Gemini output parsing.
 */
export function parseGeminiJson<T = any>(raw: string): T {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim()
  return JSON.parse(cleaned)
}
