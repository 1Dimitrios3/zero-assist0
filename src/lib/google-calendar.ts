import { google } from "googleapis";
import { getOAuth2Client } from "./google-auth";

// Re-export auth functions for backward compatibility
export {
  getAuthUrl,
  getTokensFromCode,
  loadSavedTokens,
  isAuthenticated,
} from "./google-auth";

// Get authenticated calendar client
export function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getOAuth2Client() });
}

// Calendar API functions
export async function listEvents(
  timeMin?: string,
  timeMax?: string,
  maxResults = 10
) {
  const calendar = getCalendarClient();
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin || new Date().toISOString(),
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items || [];
}

export async function createEvent(
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    location?: string;
    reminders?: {
      useDefault: boolean;
      overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
    };
    attendees?: Array<{
      email: string;
      displayName?: string;
      optional?: boolean;
    }>;
    recurrence?: string[];
  },
  sendUpdates: "all" | "externalOnly" | "none" = "all"
) {
  const calendar = getCalendarClient();
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
    sendUpdates,
  });
  return response.data;
}

export async function updateEvent(
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start?: { dateTime: string; timeZone?: string };
    end?: { dateTime: string; timeZone?: string };
    location?: string;
    reminders?: {
      useDefault: boolean;
      overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
    };
    attendees?: Array<{
      email: string;
      displayName?: string;
      optional?: boolean;
    }>;
    recurrence?: string[];
  },
  sendUpdates: "all" | "externalOnly" | "none" = "all"
) {
  const calendar = getCalendarClient();
  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: event,
    sendUpdates,
  });
  return response.data;
}

export async function deleteEvent(eventId: string) {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
  return { success: true };
}

export async function searchEvents(query: string, maxResults = 10) {
  const calendar = getCalendarClient();
  const response = await calendar.events.list({
    calendarId: "primary",
    q: query,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
    timeMin: new Date().toISOString(),
  });
  return response.data.items || [];
}
