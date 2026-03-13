import { google, docs_v1 } from "googleapis";
import { getOAuth2Client } from "./google-auth";

const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";

function getDocsClient() {
  return google.docs({ version: "v1", auth: getOAuth2Client() });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getOAuth2Client() });
}

// --- Interfaces ---

export interface DocHeader {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
  owners: string[];
}

export interface DocFull extends DocHeader {
  content: string;
  wordCount: number;
}

// --- Helper: extract plain text from Google Docs structured body ---

function extractPlainText(document: docs_v1.Schema$Document): string {
  const body = document.body;
  if (!body?.content) return "";

  const textParts: string[] = [];

  for (const element of body.content) {
    if (element.paragraph?.elements) {
      for (const el of element.paragraph.elements) {
        if (el.textRun?.content) {
          textParts.push(el.textRun.content);
        }
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          for (const cellContent of cell.content ?? []) {
            if (cellContent.paragraph?.elements) {
              for (const el of cellContent.paragraph.elements) {
                if (el.textRun?.content) {
                  textParts.push(el.textRun.content);
                }
              }
            }
          }
        }
      }
    }
  }

  return textParts.join("");
}

// --- API Functions ---

export async function listDocs(maxResults = 10): Promise<DocHeader[]> {
  const drive = getDriveClient();
  const response = await drive.files.list({
    q: `mimeType = '${GOOGLE_DOCS_MIME_TYPE}' and trashed = false`,
    pageSize: maxResults,
    fields: "files(id, name, modifiedTime, webViewLink, owners)",
    orderBy: "modifiedTime desc",
  });

  return (response.data.files ?? []).map((file) => ({
    id: file.id!,
    name: file.name ?? "Untitled",
    modifiedTime: file.modifiedTime ?? "",
    webViewLink:
      file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
    owners:
      file.owners?.map(
        (o) => o.displayName ?? o.emailAddress ?? ""
      ) ?? [],
  }));
}

export async function searchDocs(
  query: string,
  maxResults = 10
): Promise<DocHeader[]> {
  const drive = getDriveClient();

  // Split query into keywords and require each one to appear in the name.
  // Drive's `name contains 'x'` matches substring, so chaining with AND
  // handles partial/fuzzy matches better than a single long substring.
  // Stop words are removed to avoid false negatives when the user's phrasing
  // differs slightly from the title (e.g., "the era" vs "an era").
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "for", "nor", "not", "yet", "so",
    "at", "by", "from", "into", "with", "about", "its", "this", "that",
    "are", "was", "were", "been", "has", "have", "had", "can", "could",
    "will", "would", "shall", "should", "may", "might", "must", "does",
    "did", "do", "is", "be", "to", "my", "your", "our", "his", "her",
  ]);
  const keywords = query
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .map((w) => w.replace(/'/g, "\\'"));

  const nameFilter =
    keywords.length > 0
      ? keywords.map((kw) => `name contains '${kw}'`).join(" and ")
      : `name contains '${query.replace(/'/g, "\\'")}'`;

  const nameQuery = `mimeType = '${GOOGLE_DOCS_MIME_TYPE}' and ${nameFilter} and trashed = false`;

  const response = await drive.files.list({
    q: nameQuery,
    pageSize: maxResults,
    fields: "files(id, name, modifiedTime, webViewLink, owners)",
    orderBy: "modifiedTime desc",
  });

  // Fallback: if name search returns nothing, search document content instead
  if (!response.data.files?.length && keywords.length > 0) {
    const contentFilter = keywords
      .map((kw) => `fullText contains '${kw}'`)
      .join(" and ");
    const contentQuery = `mimeType = '${GOOGLE_DOCS_MIME_TYPE}' and ${contentFilter} and trashed = false`;

    const fallbackResponse = await drive.files.list({
      q: contentQuery,
      pageSize: maxResults,
      fields: "files(id, name, modifiedTime, webViewLink, owners)",
      orderBy: "modifiedTime desc",
    });

    return (fallbackResponse.data.files ?? []).map((file) => ({
      id: file.id!,
      name: file.name ?? "Untitled",
      modifiedTime: file.modifiedTime ?? "",
      webViewLink:
        file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
      owners:
        file.owners?.map(
          (o) => o.displayName ?? o.emailAddress ?? ""
        ) ?? [],
    }));
  }

  return (response.data.files ?? []).map((file) => ({
    id: file.id!,
    name: file.name ?? "Untitled",
    modifiedTime: file.modifiedTime ?? "",
    webViewLink:
      file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
    owners:
      file.owners?.map(
        (o) => o.displayName ?? o.emailAddress ?? ""
      ) ?? [],
  }));
}

export async function readDoc(documentId: string): Promise<DocFull> {
  const docs = getDocsClient();
  const drive = getDriveClient();

  const docResponse = await docs.documents.get({ documentId });
  const content = extractPlainText(docResponse.data);

  const fileResponse = await drive.files.get({
    fileId: documentId,
    fields: "id, name, modifiedTime, webViewLink, owners",
  });

  return {
    id: documentId,
    name:
      fileResponse.data.name ?? docResponse.data.title ?? "Untitled",
    modifiedTime: fileResponse.data.modifiedTime ?? "",
    webViewLink:
      fileResponse.data.webViewLink ??
      `https://docs.google.com/document/d/${documentId}/edit`,
    owners:
      fileResponse.data.owners?.map(
        (o) => o.displayName ?? o.emailAddress ?? ""
      ) ?? [],
    content,
    wordCount: content.split(/\s+/).filter(Boolean).length,
  };
}

export async function createDoc(
  title: string,
  content?: string
): Promise<{ id: string; title: string; webViewLink: string }> {
  const docs = getDocsClient();

  const createResponse = await docs.documents.create({
    requestBody: { title },
  });

  const documentId = createResponse.data.documentId!;

  if (content) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });
  }

  const drive = getDriveClient();
  const fileResponse = await drive.files.get({
    fileId: documentId,
    fields: "webViewLink",
  });

  return {
    id: documentId,
    title: createResponse.data.title ?? title,
    webViewLink:
      fileResponse.data.webViewLink ??
      `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

export async function appendToDoc(
  documentId: string,
  text: string
): Promise<{ documentId: string; appended: boolean }> {
  const docs = getDocsClient();

  const docResponse = await docs.documents.get({ documentId });
  const body = docResponse.data.body;
  const endIndex = body?.content
    ? body.content[body.content.length - 1]?.endIndex ?? 1
    : 1;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: Math.max(endIndex - 1, 1) },
            text: "\n" + text,
          },
        },
      ],
    },
  });

  return { documentId, appended: true };
}

export async function editDoc(
  documentId: string,
  edits: Array<{ find: string; replace: string; matchCase?: boolean }>
): Promise<{ documentId: string; editsApplied: number }> {
  const docs = getDocsClient();

  const requests = edits.map((edit) => ({
    replaceAllText: {
      containsText: {
        text: edit.find,
        matchCase: edit.matchCase ?? true,
      },
      replaceText: edit.replace,
    },
  }));

  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });

  const totalReplaced =
    response.data.replies?.reduce(
      (sum, reply) =>
        sum + (reply.replaceAllText?.occurrencesChanged ?? 0),
      0
    ) ?? 0;

  return { documentId, editsApplied: totalReplaced };
}
