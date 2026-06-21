import Anthropic from "@anthropic-ai/sdk";
import { buildClassifierPrompt } from "./classifierPrompt.js";
import type { CameraProfile, PriorContext } from "./types.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClassifier(
  conditions: string,
  camera_profile: CameraProfile | null,
  prior_context: PriorContext | null
): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const response = await client.messages.create({
    model,
    max_tokens: 400,
    temperature: 0,
    system: buildClassifierPrompt(camera_profile, prior_context),
    messages: [{ role: "user", content: conditions }],
  });
  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected content block type: ${block.type}`);
  }
  return block.text;
}
