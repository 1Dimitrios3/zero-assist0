import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { ClassificationResult, AgentRoute } from "./types";
import { MODEL_ID } from "@/app/api/chat/prompts";

const classificationSchema = z.object({
  route: z.enum(["calendar_only", "gmail_only", "gmail_then_cal", "docs_only", "gmail_then_docs", "docs_then_gmail", "docs_then_cal", "general"]),
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
      case "docs_only":
        return `"docs_only" - Google Docs operations: listing, reading, creating, searching, editing, or appending to Google Docs documents. This includes viewing document content, creating new docs, searching for docs by name, and modifying document text.`;
      case "gmail_then_docs":
        return `"gmail_then_docs" - Tasks that require BOTH reading/checking emails AND creating or updating Google Docs based on email content (e.g., "check my emails and create a summary doc", "read emails from the team and compile them into a document")`;
      case "docs_then_gmail":
        return `"docs_then_gmail" - Tasks that require finding/reading a Google Doc AND sending or composing an email that references it (e.g., "find my bitcoin doc and email it to John", "send an email with the project doc attached", "email Dimitris the meeting notes document")`;
      case "docs_then_cal":
        return `"docs_then_cal" - Tasks that involve BOTH Google Docs AND calendar events. This includes: reading a document and creating events based on its content, OR creating/finding a document and linking it to a calendar event. Examples: "read my project timeline doc and schedule the milestones", "create an event and attach this doc", "schedule a meeting and include my notes document", "create an event and append a recent doc there too".`;
      case "general":
        return `"general" - General conversation, questions, or help that don't involve calendar, email, or documents`;
    }
  });

  const contextBlock = conversationContext
    ? `\nRecent conversation context:\n${conversationContext}\n`
    : "";

  const result = await generateText({
    model: openai(MODEL_ID as string),
    output: Output.object({ schema: classificationSchema }),
    prompt: `You are an intent classifier. Given a user message and recent conversation context, determine which agent should handle it.

Available routes:
${routeDescriptions.join("\n")}
${contextBlock}
Current user message: "${userMessage}"

IMPORTANT - Apply these rules IN ORDER (first match wins):

RULE 0 (FOLLOW-UPS): If the current message is a short confirmation, name, brief reply, or a simple change request (e.g., "yes", "ok", "that's fine", "Dimitris", "sure send it", "reschedule it for Monday", "change the date to the 15th"), look at the conversation context to determine what task was in progress:
   - If the assistant was composing/drafting an email or asking for email details (recipient, subject, body) and the conversation does NOT involve finding/attaching a document → "gmail_only"
   - If the assistant was proposing a calendar event or asking about scheduling details → "calendar_only"
   - If the assistant was working on both email and calendar → "gmail_then_cal"
   - If the assistant was working on Google Docs (creating, reading, editing, or searching documents) with NO email or calendar involvement → "docs_only"
   - If the assistant was working on reading emails to create/update documents → "gmail_then_docs"
   - If the assistant was working on finding/reading a document to send via email, OR was asking which document to attach/include/reference in an email, OR the user is providing a document name in the context of sending an email → "docs_then_gmail"
   - If the assistant was working on documents and calendar (in either direction):
     • If the follow-up is ONLY about scheduling/rescheduling/time changes (no document operations mentioned) → "calendar_only" (the document part is already done)
     • If the follow-up is ONLY about document changes (no calendar operations mentioned) → "docs_only" (the calendar part is already done)
     • If the follow-up involves BOTH documents and calendar → "docs_then_cal"
   - This rule ensures that ongoing multi-turn tasks stay on the correct route while not re-running completed steps.

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

3. "calendar_only" — The message is about calendar operations with NO mention of reading/sending emails or documents:
   - "create a meeting tomorrow at 2pm"
   - "what's on my calendar today"
   - Follow-ups like "yes book it", "ok schedule that" when prior context discussed CREATING A CALENDAR EVENT (not sending an email)

4. "docs_only" — The message is about Google Docs operations with NO mention of reading/sending emails or calendar:
   - "show me my recent documents"
   - "create a new document called Project Plan"
   - "search for docs about the quarterly report"
   - "read the meeting notes document"
   - "add some notes to my project plan doc"
   - "change the title in my report document"

5. "gmail_then_docs" — The message asks to read/check emails AND create or update a document based on email content:
   - "read emails from the team and create a summary doc"
   - "check my emails about the project and compile them into a document"
   - The key is: the user wants to BOTH read emails AND create/update a Google Doc in one request.

6. "docs_then_gmail" — The message asks to SEND or COMPOSE an email that references or includes a Google Doc:
   - "find my bitcoin doc and email it to John"
   - "send an email with the project doc to dimitris@example.com"
   - "create an email about bitcoin trends and append the bitcoin document"
   - "email Dimitris the meeting notes document"
   - "send an email with this document attached and an event reminder"
   - The key is: the PRIMARY action is SENDING AN EMAIL that references a document. Even if the email body mentions calendar events, meetings, or reminders, this is still "docs_then_gmail" because the user is asking to SEND an email, not create a calendar event.
   - IMPORTANT: If the user says "send an email" or "email someone" and also mentions a document, this is ALWAYS "docs_then_gmail", even if the email content talks about events or reminders.

7. "docs_then_cal" — The message involves BOTH Google Docs AND calendar events, in either direction:
   - "read my project timeline doc and schedule the milestones"
   - "check the meeting notes and schedule follow-up meetings"
   - "create a meeting tomorrow and attach this doc"
   - "schedule an event and include my notes document"
   - "create an event and append a recent doc there too"
   - "create a document with highlights from this email and create an event about it"
   - The key is: the user wants BOTH a document operation AND a calendar operation in one request.
   - IMPORTANT: If the user asks to CREATE a document (even based on email content already shown in conversation) AND also create a calendar event, this is "docs_then_cal" NOT "gmail_then_cal". The distinction is: "gmail_then_cal" requires READING new emails first; if email content is already in conversation context and the user wants to create a doc + event, choose "docs_then_cal".

8. "general" — Does not involve email, calendar, or documents at all`,
  });

  return result.output ?? { route: "general", reasoning: "Fallback" };
}
