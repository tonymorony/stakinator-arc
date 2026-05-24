import Anthropic from "@anthropic-ai/sdk";

/**
 * Singleton Anthropic SDK client.
 * Configured by `ANTHROPIC_API_KEY`. Imported anywhere the LLM is called.
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

/** Per project.mdc + ai-layer.mdc. Do not hardcode another model elsewhere. */
export const MODEL = "claude-sonnet-4-6";

export function hasAnthropicKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.length > 0;
}

/** Strip ```json fences and surrounding whitespace before JSON.parse. */
export function extractJSON<T>(text: string): T {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
