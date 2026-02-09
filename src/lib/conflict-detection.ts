import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { listEvents } from "./google-calendar";

const eventIntentSchema = z.object({
  isCreateEvent: z
    .boolean()
    .describe(
      "Whether the user is requesting to create/schedule a new calendar event"
    ),
  proposedStartTime: z
    .string()
    .nullable()
    .describe(
      "The proposed start time in ISO 8601 format, if detectable from the message. Null if not detectable."
    ),
  proposedEndTime: z
    .string()
    .nullable()
    .describe(
      "The proposed end time in ISO 8601 format, if detectable. If only start time is mentioned, assume 1 hour duration. Null if not detectable."
    ),
});

const conflictDetectionSchema = z.object({
  decision: z.enum(["0", "1"]),
  conflictingEvents: z
    .array(
      z.object({
        title: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      })
    )
    .nullable()
    .describe("Array of overlapping events when decision is 1, null otherwise"),
  summary: z
    .string()
    .nullable()
    .describe("Brief description of conflicts when decision is 1, null otherwise"),
});

export const extractEventIntent = async (
  userMessage: string,
  currentDate: string,
  timeZone: string
) => {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: eventIntentSchema }),
    prompt: `You are analyzing a user message to determine if they want to create or schedule a new calendar event.

Current date/time: ${currentDate}
User's timezone: ${timeZone}

User message: "${userMessage}"

Determine:
1. Is this a request to CREATE or SCHEDULE a new event? (not list, search, update, or delete)
2. If yes, extract the proposed start and end times in ISO 8601 format with the correct timezone offset for ${timeZone}. For example, if the timezone is Europe/Athens (UTC+2), "10am" should be "2026-02-15T10:00:00+02:00", NOT "2026-02-15T10:00:00Z".
3. If only a start time is mentioned, assume a 1-hour duration.
4. If times cannot be determined, set them to null.`,
  });

  return result.output;
};

export const getExistingEvents = async (
  proposedStart: string,
  proposedEnd: string
) => {
  const events = await listEvents(proposedStart, proposedEnd);

  return events.map((event: any) => ({
    title: event.summary || "Untitled Event",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
  }));
};

export const detectConflict = async (
  existingEvents: Array<{ title: string; start: string; end: string }>,
  proposedStart: string,
  proposedEnd: string
) => {
  const conflictRouterResult = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: conflictDetectionSchema }),
    prompt: `You are a calendar conflict detection router.
Your job is to determine if a proposed event time overlaps with any existing events.

<existing-events>
  ${JSON.stringify(existingEvents, null, 2)}
</existing-events>

<proposed-time>
  Start: ${proposedStart}
  End: ${proposedEnd}
</proposed-time>

<rules>
  - Return "1" if ANY existing event overlaps with the proposed time range (even partial overlap).
  - Return "0" if the proposed time slot is completely free with no overlapping events.
  - If decision is "1", populate conflictingEvents with the details of ALL overlapping events.
  - If decision is "1", provide a brief human-readable summary of the conflicts.
  - A conflict exists when: existingStart < proposedEnd AND existingEnd > proposedStart.
</rules>

<output-format>
  Return a JSON object with:
  - decision: strictly "0" or "1"
  - conflictingEvents: array of overlapping events (only when decision is "1")
  - summary: brief description of conflicts (only when decision is "1")
</output-format>`,
  });

  console.log(
    "conflictRouterResult.output.decision --->",
    conflictRouterResult.output?.decision
  );
  return conflictRouterResult;
};

export const formatConflictMessage = (result: {
  conflictingEvents?: Array<{
    title: string;
    startTime: string;
    endTime: string;
  }> | null;
  summary?: string | null;
}): string => {
  let message = `**Scheduling Conflict Detected**\n\n`;

  if (result.summary) {
    message += `${result.summary}\n\n`;
  }

  if (result.conflictingEvents && result.conflictingEvents.length > 0) {
    message += `Conflicting events:\n`;
    for (const event of result.conflictingEvents) {
      message += `- **${event.title}**: ${event.startTime} → ${event.endTime}\n`;
    }
  }

  message += `\nWould you like to:\n`;
  message += `• Choose a different time?\n`;
  message += `• See available slots for this day?\n`;
  message += `• Create the event anyway (override)?\n`;

  return message;
};
