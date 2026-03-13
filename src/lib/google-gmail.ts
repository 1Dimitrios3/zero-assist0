import { google, gmail_v1 } from "googleapis";
import { getOAuth2Client } from "./google-auth";

const GMAIL_USER_ID = process.env.GMAIL_USER_ID || "me";

function getGmailClient() {
  return google.gmail({ version: "v1", auth: getOAuth2Client() });
}

export interface EmailHeader {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

export interface EmailFull extends EmailHeader {
  body: string;
  cc?: string;
  bcc?: string;
}

// Extract header value from Gmail message headers
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

// Decode base64url-encoded body
function decodeBody(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf-8");
}

// Recursively extract plain text body from message payload
function extractTextBody(payload: gmail_v1.Schema$MessagePart): string {
  // Direct body on the payload
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }

  // Multipart: recurse into parts, prefer text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBody(part.body.data);
      }
    }
    // Fallback: try text/html if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBody(part.body.data);
      }
    }
    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractTextBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

export async function listEmails(
  maxResults = 10,
  labelIds: string[] = ["INBOX"]
): Promise<EmailHeader[]> {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.list({
    userId: GMAIL_USER_ID,
    maxResults,
    labelIds,
  });

  if (!response.data.messages) return [];

  const emails = await Promise.all(
    response.data.messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: GMAIL_USER_ID,
        id: msg.id!,
        format: "METADATA",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const headers = detail.data.payload?.headers ?? [];
      return {
        id: detail.data.id!,
        threadId: detail.data.threadId!,
        subject: getHeader(headers, "Subject"),
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        date: getHeader(headers, "Date"),
        snippet: detail.data.snippet ?? "",
        labelIds: detail.data.labelIds ?? [],
      };
    })
  );

  return emails;
}

export async function readEmail(messageId: string): Promise<EmailFull> {
  const gmail = getGmailClient();
  const detail = await gmail.users.messages.get({
    userId: GMAIL_USER_ID,
    id: messageId,
    format: "FULL",
  });

  const headers = detail.data.payload?.headers ?? [];
  const body = detail.data.payload
    ? extractTextBody(detail.data.payload)
    : "";

  return {
    id: detail.data.id!,
    threadId: detail.data.threadId!,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc") || undefined,
    bcc: getHeader(headers, "Bcc") || undefined,
    date: getHeader(headers, "Date"),
    snippet: detail.data.snippet ?? "",
    labelIds: detail.data.labelIds ?? [],
    body,
  };
}

/**
 * Build fallback queries for a from: search that returned 0 results.
 * Tries: first word only via from:, then the name as a plain keyword search.
 */
function buildFromFallbacks(query: string): string[] {
  const fromMatch = query.match(/^from:(.+)$/i);
  if (!fromMatch) return [];

  const name = fromMatch[1].trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [name]; // plain keyword fallback

  const fallbacks: string[] = [];
  // Try from: with first word only (handles surname typos)
  fallbacks.push(`from:${words[0]}`);
  // Try plain keyword search with full name (matches subject/body too)
  fallbacks.push(name);
  return fallbacks;
}

export async function searchEmails(
  query: string,
  maxResults = 10
): Promise<EmailHeader[]> {
  const gmail = getGmailClient();

  const fetchResults = async (q: string): Promise<EmailHeader[]> => {
    const response = await gmail.users.messages.list({
      userId: GMAIL_USER_ID,
      q,
      maxResults,
    });

    if (!response.data.messages) return [];

    return Promise.all(
      response.data.messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: GMAIL_USER_ID,
          id: msg.id!,
          format: "METADATA",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers ?? [];
        return {
          id: detail.data.id!,
          threadId: detail.data.threadId!,
          subject: getHeader(headers, "Subject"),
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          date: getHeader(headers, "Date"),
          snippet: detail.data.snippet ?? "",
          labelIds: detail.data.labelIds ?? [],
        };
      })
    );
  };

  // Primary search
  const results = await fetchResults(query);
  if (results.length > 0) return results;

  // Automatic fallback for from: queries that returned nothing
  const fallbacks = buildFromFallbacks(query);
  for (const fallbackQuery of fallbacks) {
    const fallbackResults = await fetchResults(fallbackQuery);
    if (fallbackResults.length > 0) return fallbackResults;
  }

  return [];
}

// Build RFC 2822 formatted email and base64url-encode it
function buildRawEmail(params: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${params.to}`);
  if (params.cc) lines.push(`Cc: ${params.cc}`);
  if (params.bcc) lines.push(`Bcc: ${params.bcc}`);
  lines.push(`Subject: ${params.subject}`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("");
  lines.push(params.body);

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): Promise<{ id: string; threadId: string }> {
  const gmail = getGmailClient();
  const raw = buildRawEmail(params);
  const response = await gmail.users.messages.send({
    userId: GMAIL_USER_ID,
    requestBody: { raw },
  });
  return {
    id: response.data.id!,
    threadId: response.data.threadId!,
  };
}

export async function replyToEmail(params: {
  messageId: string;
  threadId: string;
  body: string;
  to: string;
  subject: string;
  cc?: string;
}): Promise<{ id: string; threadId: string }> {
  const gmail = getGmailClient();

  // Get the original message to extract Message-ID for In-Reply-To header
  const original = await gmail.users.messages.get({
    userId: GMAIL_USER_ID,
    id: params.messageId,
    format: "METADATA",
    metadataHeaders: ["Message-ID"],
  });

  const messageIdHeader = getHeader(
    original.data.payload?.headers ?? [],
    "Message-ID"
  );

  const raw = buildRawEmail({
    to: params.to,
    subject: params.subject.startsWith("Re:")
      ? params.subject
      : `Re: ${params.subject}`,
    body: params.body,
    cc: params.cc,
    inReplyTo: messageIdHeader,
    references: messageIdHeader,
  });

  const response = await gmail.users.messages.send({
    userId: GMAIL_USER_ID,
    requestBody: { raw, threadId: params.threadId },
  });

  return {
    id: response.data.id!,
    threadId: response.data.threadId!,
  };
}
