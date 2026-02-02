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
      "Create a new calendar event. Use this to schedule meetings, appointments, or reminders. You can set custom notification times using the reminders parameter and invite guests using the guests parameter.",
    inputSchema: createEventSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof createEventSchema>) => {
      const { summary, description, startDateTime, endDateTime, location, timeZone, reminders, guests } = params;
      const event = await createEvent({
        summary,
        description,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
        location,
        reminders: reminders
          ? { useDefault: false, overrides: reminders }
          : undefined,
        attendees: guests,
      });
      return {
        id: event.id,
        summary: event.summary,
        htmlLink: event.htmlLink,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        guests: event.attendees?.map((a) => a.email),
      };
    },
  }),

  updateEvent: tool({
    description: "Update an existing calendar event by its ID. You can update reminder/notification times and add/replace guests.",
    inputSchema: updateEventSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof updateEventSchema>) => {
      const { eventId, summary, description, startDateTime, endDateTime, location, timeZone, reminders, guests } = params;
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

      const event = await updateEvent(eventId, updateData);
      return {
        id: event.id,
        summary: event.summary,
        htmlLink: event.htmlLink,
        updated: true,
        guests: event.attendees?.map((a) => a.email),
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
