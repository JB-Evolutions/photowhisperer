import "dotenv/config";
import { getSettings } from "../src/api/orchestrate.js";

const userInput = process.argv[2];

if (!userInput) {
  console.error("Usage: tsx scripts/e2e.ts \"<scene description>\"");
  process.exit(1);
}

try {
  const result = await getSettings(userInput);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error("Unexpected error:", err);
  process.exit(1);
}
