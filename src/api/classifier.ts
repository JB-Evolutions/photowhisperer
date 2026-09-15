import Anthropic from "@anthropic-ai/sdk";
import { buildClassifierPrompt } from "./classifierPrompt";
import type { ImageInput, PriorContext } from "./types";

let client: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// The API rejects an empty text block, and a photo may arrive with no words.
const EMPTY_TEXT_PLACEHOLDER = "(no description provided)";

export async function callClassifier(
  conditions: string,
  prior_context: PriorContext | null,
  image: ImageInput | null = null
): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const text = conditions.trim() === "" ? EMPTY_TEXT_PLACEHOLDER : conditions;

  // Image block first, then text — Anthropic's guidance is that this ordering
  // improves results.
  const content: Anthropic.MessageParam["content"] = image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: image.jpegBase64 },
        },
        { type: "text", text },
      ]
    : text;

  const response = await getAnthropic().messages.create({
    model,
    // A truncated response is a JSON parse failure that reaches the user as a
    // generic error; the image path needs the headroom.
    max_tokens: 700,
    temperature: 0,
    system: buildClassifierPrompt(prior_context, image),
    messages: [{ role: "user", content }],
  });
  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected content block type: ${block.type}`);
  }
  return block.text;
}
