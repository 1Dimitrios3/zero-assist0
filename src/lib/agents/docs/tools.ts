import { tool } from "ai";
import { z } from "zod";
import {
  listDocs,
  readDoc,
  searchDocs,
  createDoc,
  appendToDoc,
  editDoc,
} from "../../google-docs";

const listDocsSchema = z.object({
  maxResults: z
    .number()
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of documents to return (default 10, max 50)"),
});

const readDocSchema = z.object({
  documentId: z.string().describe("The ID of the Google Doc to read"),
});

const searchDocsSchema = z.object({
  query: z
    .string()
    .describe(
      "Search query to find documents by name (e.g., 'meeting notes', 'project plan')"
    ),
  maxResults: z
    .number()
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of documents to return (default 10, max 50)"),
});

const createDocSchema = z.object({
  title: z.string().describe("Title for the new document"),
  content: z
    .string()
    .optional()
    .describe(
      "Initial text content for the document. If not provided, creates a blank document."
    ),
});

const appendToDocSchema = z.object({
  documentId: z
    .string()
    .describe("The ID of the Google Doc to append content to"),
  text: z
    .string()
    .describe("Text content to append to the end of the document"),
});

const editDocSchema = z.object({
  documentId: z
    .string()
    .describe("The ID of the Google Doc to edit"),
  edits: z
    .array(
      z.object({
        find: z.string().describe("The text to find in the document"),
        replace: z.string().describe("The text to replace it with"),
        matchCase: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether the search should be case-sensitive (default true)"),
      })
    )
    .describe(
      "Array of find-and-replace operations to apply to the document"
    ),
});

export const docsTools = {
  listDocs: tool({
    description:
      "List recent Google Docs documents sorted by last modified. Use this to see the user's documents.",
    inputSchema: listDocsSchema,
    execute: async (params: z.infer<typeof listDocsSchema>) => {
      const docs = await listDocs(params.maxResults);
      return docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        modifiedTime: doc.modifiedTime,
        webViewLink: doc.webViewLink,
      }));
    },
  }),

  readDoc: tool({
    description:
      "Read the full text content of a Google Doc by its document ID. Use this to retrieve and display the contents of a specific document. Always use this before editing a document.",
    inputSchema: readDocSchema,
    execute: async (params: z.infer<typeof readDocSchema>) => {
      const doc = await readDoc(params.documentId);
      return {
        id: doc.id,
        name: doc.name,
        modifiedTime: doc.modifiedTime,
        webViewLink: doc.webViewLink,
        content: doc.content,
        wordCount: doc.wordCount,
      };
    },
  }),

  searchDocs: tool({
    description:
      "Search for Google Docs documents by name. Use this to find specific documents when the user refers to a document by name.",
    inputSchema: searchDocsSchema,
    execute: async (params: z.infer<typeof searchDocsSchema>) => {
      const docs = await searchDocs(params.query, params.maxResults);
      return docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        modifiedTime: doc.modifiedTime,
        webViewLink: doc.webViewLink,
      }));
    },
  }),

  createDoc: tool({
    description:
      "Create a new Google Doc with an optional initial content. Returns the document ID and link.",
    inputSchema: createDocSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof createDocSchema>) => {
      const result = await createDoc(params.title, params.content);
      return {
        id: result.id,
        title: result.title,
        webViewLink: result.webViewLink,
        created: true,
      };
    },
  }),

  appendToDoc: tool({
    description:
      "Append text content to the end of an existing Google Doc. Use readDoc first to verify the document ID and see current content.",
    inputSchema: appendToDocSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof appendToDocSchema>) => {
      const result = await appendToDoc(params.documentId, params.text);
      return {
        documentId: result.documentId,
        appended: true,
      };
    },
  }),

  editDoc: tool({
    description:
      "Edit an existing Google Doc using find-and-replace operations. You MUST call readDoc first to see the current content before editing. Each edit replaces all occurrences of the 'find' text with the 'replace' text.",
    inputSchema: editDocSchema,
    needsApproval: true,
    execute: async (params: z.infer<typeof editDocSchema>) => {
      const result = await editDoc(params.documentId, params.edits);
      return {
        documentId: result.documentId,
        editsApplied: result.editsApplied,
      };
    },
  }),
};
