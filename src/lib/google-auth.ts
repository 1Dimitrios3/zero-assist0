import { google } from "googleapis";
import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "token.json");

// Scopes for Calendar, Gmail, and user profile (for display name in emails)
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "profile",
];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate auth URL for user consent
export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
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

/**
 * Returns which Google services the current token has access to.
 * Reads scope directly from token.json (more reliable than oauth2Client.credentials.scope,
 * which can be lost after automatic token refresh).
 */
export function getGrantedServices(): {
  calendar: boolean;
  gmail: boolean;
} {
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return { calendar: false, gmail: false };
    }
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const scope: string = tokens.scope ?? "";

    return {
      calendar: scope.includes("calendar"),
      gmail:
        scope.includes("gmail.readonly") ||
        scope.includes("gmail.compose"),
    };
  } catch {
    return { calendar: false, gmail: false };
  }
}

// Returns the shared authenticated OAuth2 client for use by service modules
export function getOAuth2Client() {
  loadSavedTokens();
  return oauth2Client;
}

/**
 * Returns the authenticated user's display name from their Google profile.
 * Requires the "profile" OAuth scope.
 */
export async function getUserName(): Promise<string | null> {
  try {
    loadSavedTokens();
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data.name ?? data.given_name ?? null;
  } catch {
    return null;
  }
}
