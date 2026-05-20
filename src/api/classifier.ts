import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_PROMPT } from "./classifierPrompt.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClassifier(userText: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
  const response = await client.messages.create({
    model,
    max_tokens: 400,
    system: CLASSIFIER_PROMPT,
    messages: [{ role: "user", content: userText }],
  });
  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected content block type: ${block.type}`);
  }
  return block.text;
}
