# Agent Reference

## Calendar Agent
- **Tools (6)**: list, create, update, delete, search, conflictWarning
- **Pre-processing**: Scheduling conflict detection
- **Approval required**: create, update, delete, conflictWarning
- **Location**: `src/lib/agents/calendar/`

## Email Agent
- **Tools (5)**: listEmails, readEmail, searchEmails, sendEmail, replyToEmail
- **Approval required**: sendEmail, replyToEmail
- **Location**: `src/lib/agents/email/`

## Docs Agent
- **Tools (6)**: listDocs, readDoc, searchDocs, createDoc, appendToDoc, editDoc
- **Approval required**: createDoc, appendToDoc, editDoc
- **APIs used**: Google Docs API for content, Google Drive API for listing/searching
- **Location**: `src/lib/agents/docs/`

## General Agent
- No tools, conversational fallback
