import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { ClassificationResult, AgentRoute } from "./types";

const classificationSchema = z.object({
  route: z.enum(["calendar_only", "gmail_only", "gmail_then_cal", "general"]),
  reasoning: z.string(),
});

/**
 * Classifies user intent to determine which agent(s) should handle the request.
 * Uses gpt-4o-mini for fast, cheap classification.
 */
export async function classifyIntent(
  userMessage: string,
  availableRoutes: AgentRoute[]
): Promise<ClassificationResult> {
  const routeDescriptions = availableRoutes.map((r) => {
    switch (r) {
      case "calendar_only":
        return `"calendar_only" - Calendar operations: viewing, creating, updating, deleting, or searching calendar events and meetings`;
      case "gmail_only":
        return `"gmail_only" - Email operations: reading, sending, searching, or managing emails`;
      case "gmail_then_cal":
        return `"gmail_then_cal" - Tasks that involve both email and calendar (e.g., "check my emails and schedule meetings based on them")`;
      case "general":
        return `"general" - General conversation, questions, or help that don't involve calendar or email`;
    }
  });

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: classificationSchema }),
    prompt: `You are an intent classifier. Given a user message, determine which agent should handle it.

Available routes:
${routeDescriptions.join("\n")}

User message: "${userMessage}"

Classify the intent. If it involves calendar at all (scheduling, events, meetings, appointments), use "calendar_only". If unsure, default to "general".`,
  });

  return result.output ?? { route: "general", reasoning: "Fallback" };
}
