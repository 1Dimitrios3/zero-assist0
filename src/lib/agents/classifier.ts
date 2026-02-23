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
 * Receives recent conversation context to handle follow-up messages correctly.
 */
export async function classifyIntent(
  userMessage: string,
  availableRoutes: AgentRoute[],
  conversationContext?: string
): Promise<ClassificationResult> {
  const routeDescriptions = availableRoutes.map((r) => {
    switch (r) {
      case "calendar_only":
        return `"calendar_only" - Calendar operations: viewing, creating, updating, deleting, or searching calendar events and meetings. Also use this for follow-up messages that refer to booking/scheduling a meeting discussed earlier in the conversation.`;
      case "gmail_only":
        return `"gmail_only" - Email operations: reading, sending, composing, searching, or managing emails. Includes sending emails whose content mentions meetings — sending an email ABOUT a meeting is NOT a calendar operation.`;
      case "gmail_then_cal":
        return `"gmail_then_cal" - Tasks that require BOTH reading emails AND creating calendar events in one request (e.g., "check my emails and schedule meetings based on them", "read emails from X and see if they want a meeting")`;
      case "general":
        return `"general" - General conversation, questions, or help that don't involve calendar or email`;
    }
  });

  const contextBlock = conversationContext
    ? `\nRecent conversation context:\n${conversationContext}\n`
    : "";

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: classificationSchema }),
    prompt: `You are an intent classifier. Given a user message and recent conversation context, determine which agent should handle it.

Available routes:
${routeDescriptions.join("\n")}
${contextBlock}
Current user message: "${userMessage}"

IMPORTANT - Apply these rules IN ORDER (first match wins):

RULE 0 (FOLLOW-UPS): If the current message is a short confirmation, name, or brief reply (e.g., "yes", "ok", "that's fine", "Dimitris", "sure send it"), look at the conversation context to determine what task was in progress:
   - If the assistant was composing/drafting an email or asking for email details (recipient, subject, body, name) → "gmail_only"
   - If the assistant was proposing a calendar event or asking about scheduling details → "calendar_only"
   - If the assistant was working on both email and calendar → "gmail_then_cal"
   - This rule ensures that ongoing multi-turn tasks stay on the correct route.

1. "gmail_then_cal" — The message asks to read/check/get emails AND ALSO asks to CREATE or SCHEDULE a calendar event based on email content. This includes:
   - "read emails from X and check if they want a meeting"
   - "check my emails and schedule any meetings"
   - "get emails from X and see if he asks for a meeting"
   - The key is: the user wants to BOTH read emails AND create calendar events in one request.

2. "gmail_only" — Email operations: reading, sending, composing, searching, or managing emails. This includes:
   - "show me my recent emails"
   - "send an email to john"
   - "search for emails about the report"
   - "send her an email suggesting a meeting on Tuesday" — this is SENDING an email, even though the email content mentions a meeting. The user is NOT asking to create a calendar event.
   - IMPORTANT: If the user is asking to SEND or COMPOSE an email, this is gmail_only even if the email body talks about meetings, scheduling, or appointments. Sending an email ABOUT a meeting is NOT the same as creating a calendar event.

3. "calendar_only" — The message is about calendar operations with NO mention of reading/sending emails:
   - "create a meeting tomorrow at 2pm"
   - "what's on my calendar today"
   - Follow-ups like "yes book it", "ok schedule that" when prior context discussed CREATING A CALENDAR EVENT (not sending an email)

4. "general" — Does not involve email or calendar at all`,
  });

  return result.output ?? { route: "general", reasoning: "Fallback" };
}
