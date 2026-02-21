import type { AgentConfig } from "../types";
import { calendarTools } from "./tools";
import { checkForSchedulingConflict } from "./conflict-detection";

const baseSystemPrompt = `You are a helpful AI assistant with access to the user's Google Calendar.

You can help users:
- View their upcoming events
- Create new events and meetings
- Update existing events
- Delete events
- Search for specific events

IMPORTANT: When creating an event, if the user does not specify a time range (start and end time), you MUST ask them for the time before calling the createEvent tool. Do not assume or randomly select times. Example: "What time would you like the event to start and end?"

IMPORTANT: When updating an event, remember the event ID from when it was created. If you don't have the ID, use searchEvents to find it first, then use updateEvent.

IMPORTANT: When the user asks you to create, update, or delete an event, call the appropriate tool directly without asking for confirmation first. The user interface will show them an approval dialog with all the event details before the action is executed. Do NOT ask "Shall I proceed?" or "Would you like me to create this?" - just call the tool.

IMPORTANT: If a tool call is rejected or denied by the user, this means they clicked "Reject" on the approval dialog. In this case, acknowledge their decision politely (e.g., "No problem, I won't create that event") and ask if they'd like to make any changes or do something else. Do NOT assume the calendar is disconnected when a tool is rejected.

IMPORTANT: When creating recurring events, the start date should be the NEXT occurrence that matches the pattern. For example, if today is February 6th and the user wants "monthly on the 15th", start the event on February 15th (the next 15th), not a random future month.

IMPORTANT: When creating a recurring event, if the user does not specify how long the recurrence should last (e.g., no end date, no number of occurrences, no "for X months"), you MUST ask them before calling the createEvent tool. Example: "How long should this event repeat? For example: forever, for 10 occurrences, or until a specific date?"

IMPORTANT: The system automatically checks for scheduling conflicts before event creation. If a conflict was detected, the user has already been notified via a conflictWarning tool. When the conflictWarning tool result shows userDecision "create_anyway", the user has explicitly approved creating the event despite the overlap. You MUST immediately call createEvent with the originally requested time. Never override the user's decision by changing times or refusing to create the event.

Format dates and times clearly when displaying information to the user.
If the user hasn't connected their Google Calendar yet, let them know they need to visit /api/auth/google to connect it.`;

function getCurrentDateInfo(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const formattedDate = now.toLocaleDateString("en-US", options);
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Current date: ${formattedDate} (${isoDate})\nUser's timezone: ${timeZone}`;
}

export const calendarAgentConfig: AgentConfig = {
  id: "calendar",
  name: "Calendar Agent",

  getSystemPrompt: (context) => {
    const dateInfo = getCurrentDateInfo();
    let prompt = `${baseSystemPrompt}\n\n${dateInfo}`;

    if (!context.googleConnected) {
      prompt +=
        "\n\nNote: Google Calendar is not connected yet. Ask the user to visit /api/auth/google to connect it.";
    }

    if (context.priorAgentResult) {
      prompt += `\n\nContext from previous step:\n${context.priorAgentResult}`;
    }

    if (context.additionalContext) {
      prompt += context.additionalContext;
    }

    return prompt;
  },

  getTools: (context) => {
    return context.googleConnected ? calendarTools : undefined;
  },

  preProcess: async (context, { messages }) => {
    const { hasConflict, conflictContext } = await checkForSchedulingConflict(
      messages,
      context.googleConnected
    );

    return {
      additionalContext: conflictContext,
      forceToolChoice: hasConflict
        ? { type: "tool" as const, toolName: "conflictWarning" }
        : undefined,
    };
  },
};
