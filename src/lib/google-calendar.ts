import { google } from "googleapis";
import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "token.json");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate auth URL for user consent
export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    prompt: "consent",
  });
}

// Exchange code for tokens and save
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  return tokens;
}

// Load saved tokens
export function loadSavedTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      oauth2Client.setCredentials(tokens);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Check if authenticated
export function isAuthenticated() {
  return loadSavedTokens();
}

// Get authenticated calendar client
export function getCalendarClient() {
  loadSavedTokens();
  return google.calendar({ version: "v3", auth: oauth2Client });
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
    attendees?: Array<{ email: string; displayName?: string; optional?: boolean }>;
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
    attendees?: Array<{ email: string; displayName?: string; optional?: boolean }>;
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
