import { tool } from "ai";
import { z } from "zod";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  searchEvents,
} from "./google-calendar";

// Get system timezone (e.g., "America/New_York", "Europe/Athens")
const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log('systemTimeZone ------->', systemTimeZone)

const listEventsSchema = z.object({
  timeMin: z
    .string()
    .optional()
    .describe("Start time in ISO format (defaults to now)"),
  timeMax: z
    .string()
    .optional()
    .describe("End time in ISO format (optional)"),
  maxResults: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of events to return"),
});

const reminderSchema = z.object({
  method: z
    .enum(["popup", "email"])
    .describe("Reminder method: 'popup' for notification or 'email' for email"),
  minutes: z
    .number()
    .describe("Minutes before the event to send the reminder (e.g., 10, 30, 60, 1440 for 1 day)"),
});

const attendeeSchema = z.object({
  email: z.string().email().describe("Email address of the guest"),
  displayName: z.string().optional().describe("Display name of the guest"),
  optional: z
    .boolean()
    .optional()
    .describe("Whether this guest is optional (default: false)"),
});

const recurrenceSchema = z.object({
  frequency: z
    .enum(["daily", "weekly", "monthly", "yearly"])
    .describe("How often the event repeats: daily, weekly, monthly, or yearly"),
  interval: z
    .number()
    .optional()
    .describe("Repeat every N periods. Default is 1. Bi-weekly means interval=2 (every 2 weeks). Bi-monthly means interval=2 (every 2 months)."),
  count: z
    .number()
    .optional()
    .describe("Number of occurrences. Only use when user explicitly says 'for X occurrences'."),
  until: z
    .string()
    .optional()
    .describe("End date in YYYY-MM-DD format. Use for time-based durations. 'For the whole year' means until Dec 31 of current year. 'For a year' means 1 year from start date."),
  byDay: z
    .array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
    .optional()
    .describe("Days of week for weekly recurrence: MO, TU, WE, TH, FR, SA, SU"),
  byMonthDay: z
    .array(z.number())
    .optional()
    .describe("Days of the month for monthly recurrence. Use -1 for last day of month, -2 for second-to-last, etc."),
  byMonth: z
    .array(z.number())
    .optional()
    .describe("Months (1-12) for yearly recurrence"),
});

function buildRRule(recurrence: z.infer<typeof recurrenceSchema>): string {
  console.log('[buildRRule] input:', JSON.stringify(recurrence, null, 2));

  const parts: string[] = [`FREQ=${recurrence.frequency.toUpperCase()}`];

  // Only add INTERVAL if greater than 1 (1 is the default)
  const interval = recurrence.interval ?? 1;
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }

  // COUNT and UNTIL are mutually exclusive per RFC 5545 - prioritize COUNT when explicitly specified
  if (recurrence.count !== undefined && recurrence.count > 0) {
    parts.push(`COUNT=${recurrence.count}`);
  } else if (recurrence.until) {
    // Only use UNTIL if count is not specified
    const untilDate = new Date(recurrence.until);
    if (!isNaN(untilDate.getTime())) {
      const year = untilDate.getUTCFullYear();
      const month = String(untilDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(untilDate.getUTCDate()).padStart(2, '0');
      parts.push(`UNTIL=${year}${month}${day}`);
      console.log('[buildRRule] UNTIL date:', `${year}${month}${day}`);
    } else {
      console.log('[buildRRule] Invalid until date:', recurrence.until);
    }
  }

  if (recurrence.byDay && recurrence.byDay.length > 0) {
    parts.push(`BYDAY=${recurrence.byDay.join(',')}`);
  }

  if (recurrence.byMonthDay && recurrence.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${recurrence.byMonthDay.join(',')}`);
  }

  if (recurrence.byMonth && recurrence.byMonth.length > 0) {
    parts.push(`BYMONTH=${recurrence.byMonth.join(',')}`);
  }

  const rrule = `RRULE:${parts.join(';')}`;
  console.log('[buildRRule] output:', rrule);
  return rrule;
}

const createEventSchema = z.object({
  summary: z.string().describe("Title of the event"),
  description: z.string().optional().describe("Description of the event"),
  startDateTime: z
    .string()
    .describe("Start time in ISO format (e.g., 2024-01-15T10:00:00-05:00)"),
  endDateTime: z
    .string()
    .describe("End time in ISO format (e.g., 2024-01-15T11:00:00-05:00)"),
  location: z.string().optional().describe("Location of the event"),
  timeZone: z
    .string()
    .optional()
    .default(systemTimeZone)
    .describe("Time zone for the event"),
  reminders: z
    .array(reminderSchema)
    .optional()
    .describe("Custom reminders/notifications. If not provided, uses calendar default (30 min popup). Example: [{method: 'popup', minutes: 10}, {method: 'email', minutes: 1440}]"),
  guests: z
    .array(attendeeSchema)
    .optional()
    .describe("List of guests to invite to the event. Each guest will receive an email invitation. Example: [{email: 'john@example.com', displayName: 'John Doe'}]"),
  isRecurring: z
    .boolean()
    .default(false)
    .describe("Set to true if the user wants the event to happen more than once. Examples that require isRecurring=true: 'every Monday', 'for the next 5 days', 'weekly', 'next two Mondays', 'monthly on the 15th'. Set to false only for single one-time events."),
  recurrence: recurrenceSchema
    .optional()
    .nullable()
    .describe("Make this a recurring event. Only used when isRecurring is true. Omit or set to null for one-time events."),
});

const updateEventSchema = z.object({
  eventId: z.string().describe("The ID of the event to update"),
  summary: z.string().optional().describe("New title of the event"),
  description: z.string().optional().describe("New description of the event"),
  startDateTime: z.string().optional().describe("New start time in ISO format"),
  endDateTime: z.string().optional().describe("New end time in ISO format"),
  location: z.string().optional().describe("New location of the event"),
  timeZone: z.string().optional().describe("Time zone for the event"),
  reminders: z
    .array(reminderSchema)
    .optional()
    .describe("Custom reminders/notifications. Example: [{method: 'popup', minutes: 10}]"),
  guests: z
    .array(attendeeSchema)
    .optional()
    .describe("List of guests to add to the event. Note: This replaces all existing guests. Example: [{email: 'john@example.com'}]"),
  recurrence: recurrenceSchema
    .optional()
    .describe("Update recurrence pattern. Set to make a single event recurring or modify existing recurrence."),
});

const deleteEventSchema = z.object({
  eventId: z.string().describe("The ID of the event to delete"),
});

const searchEventsSchema = z.object({
  query: z.string().describe("Search query to find events"),
  maxResults: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of events to return"),
});

export const calendarTools = {
  listEvents: tool({
    description:
      "List upcoming calendar events. Use this to see what events are scheduled.",
    inputSchema: listEventsSchema,
    execute: async (params: z.infer<typeof listEventsSchema>) => {
      const { timeMin, timeMax, maxResults } = params;
      const events = await listEvents(timeMin, timeMax, maxResults);
      return events.map((event) => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        description: event.description,
      }));
    },
  }),

  createEvent: tool({
    description:
      "Create a new calendar event. Use this to schedule meetings, appointments, or reminders. You can set custom notification times using the reminders parameter, invite guests using the guests parameter, and create recurring events using the recurrence parameter. IMPORTANT: Only include recurrence if the user explicitly asks for a recurring event. Do not add recurrence for one-time events.",
    inputSchema: createEventSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof createEventSchema>) => {
      const { summary, description, startDateTime, endDateTime, location, timeZone, reminders, guests, isRecurring, recurrence } = params;

      // Debug: Log recurrence params
      console.log('[createEvent] isRecurring:', isRecurring);
      console.log('[createEvent] params.recurrence:', JSON.stringify(recurrence, null, 2));

      // Only build recurrence if explicitly marked as recurring OR if count > 1
      const validRecurrence = recurrence ?? undefined; // treat null as undefined
      const builtRecurrence = (isRecurring || (validRecurrence?.count && validRecurrence.count > 1)) && validRecurrence
        ? [buildRRule(validRecurrence)]
        : undefined;
      console.log('[createEvent] builtRecurrence:', builtRecurrence);

      const eventPayload = {
        summary,
        description,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
        location,
        reminders: reminders
          ? { useDefault: false, overrides: reminders }
          : undefined,
        attendees: guests,
        recurrence: builtRecurrence,
      };
      console.log('[createEvent] eventPayload:', JSON.stringify(eventPayload, null, 2));

      const event = await createEvent(eventPayload);

      console.log('[createEvent] response event.recurrence:', event.recurrence);
      return {
        id: event.id,
        summary: event.summary,
        htmlLink: event.htmlLink,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        guests: event.attendees?.map((a) => a.email),
        recurrence: event.recurrence,
      };
    },
  }),

  updateEvent: tool({
    description: "Update an existing calendar event by its ID. You can update reminder/notification times, add/replace guests, and modify recurrence patterns.",
    inputSchema: updateEventSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof updateEventSchema>) => {
      const { eventId, summary, description, startDateTime, endDateTime, location, timeZone, reminders, guests, recurrence } = params;
      const updateData: Parameters<typeof updateEvent>[1] = {};
      if (summary) updateData.summary = summary;
      if (description) updateData.description = description;
      if (location) updateData.location = location;
      if (startDateTime) {
        updateData.start = { dateTime: startDateTime, timeZone };
      }
      if (endDateTime) {
        updateData.end = { dateTime: endDateTime, timeZone };
      }
      if (reminders) {
        updateData.reminders = { useDefault: false, overrides: reminders };
      }
      if (guests) {
        updateData.attendees = guests;
      }
      if (recurrence) {
        updateData.recurrence = [buildRRule(recurrence)];
      }

      const event = await updateEvent(eventId, updateData);
      return {
        id: event.id,
        summary: event.summary,
        htmlLink: event.htmlLink,
        updated: true,
        guests: event.attendees?.map((a) => a.email),
        recurrence: event.recurrence,
      };
    },
  }),

  deleteEvent: tool({
    description: "Delete a calendar event by its ID.",
    inputSchema: deleteEventSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof deleteEventSchema>) => {
      const { eventId } = params;
      await deleteEvent(eventId);
      return { deleted: true, eventId };
    },
  }),

  searchEvents: tool({
    description:
      "Search for calendar events by keyword. Use this to find specific events.",
    inputSchema: searchEventsSchema,
    execute: async (params: z.infer<typeof searchEventsSchema>) => {
      const { query, maxResults } = params;
      const events = await searchEvents(query, maxResults);
      return events.map((event) => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
      }));
    },
  }),
};
