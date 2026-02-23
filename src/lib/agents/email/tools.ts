import { tool } from "ai";
import { z } from "zod";
import {
  listEmails,
  readEmail,
  searchEmails,
  sendEmail,
  replyToEmail,
} from "../../google-gmail";

const listEmailsSchema = z.object({
  maxResults: z
    .number()
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of emails to return (default 10, max 50)"),
});

const readEmailSchema = z.object({
  messageId: z.string().describe("The ID of the email message to read"),
});

const searchEmailsSchema = z.object({
  query: z
    .string()
    .describe(
      "Gmail search query (e.g., 'from:john@example.com', 'subject:meeting', 'is:unread', 'after:2026/02/01')"
    ),
  maxResults: z
    .number()
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of emails to return (default 10, max 50)"),
});

const emailListValidator = (val: string | undefined) =>
  !val ||
  val
    .split(",")
    .every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));

const BLOCKED_DOMAINS = ["example.com", "example.org", "example.net", "test.com"];

/**
 * Safety net against LLM hallucination — when the model doesn't have a real
 * email address it may fabricate one using placeholder domains (e.g., @example.com).
 * This catch runs after approval so a bogus address never reaches the Gmail API.
 */
function checkBlockedDomains(...fields: (string | undefined)[]) {
  const all = fields.filter(Boolean).join(",");
  const hasBlocked = all
    .split(",")
    .some((email) =>
      BLOCKED_DOMAINS.some((d) => email.trim().toLowerCase().endsWith(`@${d}`))
    );
  if (hasBlocked) {
    return {
      error:
        "Cannot send to placeholder email addresses (e.g., @example.com). Please provide a real email address.",
    };
  }
  return null;
}

const sendEmailSchema = z.object({
  to: z.string().email("Invalid email address format").describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body text"),
  cc: z
    .string()
    .optional()
    .describe("CC recipients (comma-separated email addresses)")
    .refine(emailListValidator, {
      message: "One or more CC email addresses are invalid",
    }),
  bcc: z
    .string()
    .optional()
    .describe("BCC recipients (comma-separated email addresses)")
    .refine(emailListValidator, {
      message: "One or more BCC email addresses are invalid",
    }),
});

const replyToEmailSchema = z.object({
  messageId: z
    .string()
    .describe("The ID of the email message being replied to"),
  threadId: z.string().describe("The thread ID to reply within"),
  to: z
    .string()
    .email("Invalid email address format")
    .describe("Recipient email address (usually the original sender)"),
  subject: z
    .string()
    .describe(
      "Original email subject (Re: prefix will be added automatically)"
    ),
  body: z.string().describe("Reply body text"),
  cc: z
    .string()
    .optional()
    .describe("CC recipients (comma-separated email addresses)")
    .refine(emailListValidator, {
      message: "One or more CC email addresses are invalid",
    }),
});

export const emailTools = {
  listEmails: tool({
    description:
      "List recent emails from the inbox. Use this to see what emails have arrived.",
    inputSchema: listEmailsSchema,
    execute: async (params: z.infer<typeof listEmailsSchema>) => {
      const emails = await listEmails(params.maxResults);
      return emails.map((email) => ({
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        snippet: email.snippet,
      }));
    },
  }),

  readEmail: tool({
    description:
      "Read the full content of an email including the body text. Use this to see the complete email. Always use this before replying to an email so you have the full context.",
    inputSchema: readEmailSchema,
    execute: async (params: z.infer<typeof readEmailSchema>) => {
      const email = await readEmail(params.messageId);
      return {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        to: email.to,
        cc: email.cc,
        date: email.date,
        body: email.body,
      };
    },
  }),

  searchEmails: tool({
    description:
      "Search emails using Gmail search syntax. Supports queries like 'from:user@example.com', 'subject:meeting', 'is:unread', 'has:attachment', 'after:2026/01/01'.",
    inputSchema: searchEmailsSchema,
    execute: async (params: z.infer<typeof searchEmailsSchema>) => {
      const emails = await searchEmails(params.query, params.maxResults);
      return emails.map((email) => ({
        id: email.id,
        threadId: email.threadId,
        subject: email.subject,
        from: email.from,
        date: email.date,
        snippet: email.snippet,
      }));
    },
  }),

  sendEmail: tool({
    description:
      "Compose and send a new email. Use this when the user wants to send a new email to someone.",
    inputSchema: sendEmailSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof sendEmailSchema>) => {
      const blocked = checkBlockedDomains(params.to, params.cc, params.bcc);
      if (blocked) return blocked;

      const result = await sendEmail(params);
      return {
        id: result.id,
        threadId: result.threadId,
        sent: true,
        to: params.to,
        subject: params.subject,
      };
    },
  }),

  replyToEmail: tool({
    description:
      "Reply to an existing email within its thread. Use readEmail first to get the messageId, threadId, and full context before replying.",
    inputSchema: replyToEmailSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof replyToEmailSchema>) => {
      const blocked = checkBlockedDomains(params.to, params.cc);
      if (blocked) return blocked;

      const result = await replyToEmail(params);
      return {
        id: result.id,
        threadId: result.threadId,
        sent: true,
        to: params.to,
        subject: params.subject,
      };
    },
  }),
};
