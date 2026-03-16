"use client";

import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangleIcon,
  CalendarPlusIcon,
  CalendarIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  ClockIcon,
  MapPinIcon,
  UsersIcon,
  BellIcon,
  SendIcon,
  ReplyIcon,
  MailIcon,
  FileTextIcon,
  FilePenIcon,
  FileEditIcon,
} from "lucide-react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import { useState } from "react";

interface Reminder {
  method: string;
  minutes: number;
}

interface Guest {
  email: string;
  displayName?: string;
  optional?: boolean;
}

interface ConflictingEvent {
  title: string;
  startTime: string;
  endTime: string;
}

interface ConflictWarningInput {
  summary: string;
  conflictingEvents: ConflictingEvent[];
}

interface CalendarEventInput {
  summary?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  timeZone?: string;
  eventId?: string;
  reminders?: Reminder[];
  guests?: Guest[];
}

interface EmailSendInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

interface EmailReplyInput {
  messageId: string;
  threadId: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

interface DocCreateInput {
  title: string;
  content?: string;
}

interface DocAppendInput {
  documentId: string;
  text: string;
}

interface DocEditInput {
  documentId: string;
  edits: Array<{ find: string; replace: string; matchCase?: boolean }>;
}

interface ToolApprovalProps {
  toolName: string;
  input:
    | CalendarEventInput
    | ConflictWarningInput
    | EmailSendInput
    | EmailReplyInput
    | DocCreateInput
    | DocAppendInput
    | DocEditInput;
  approvalId: string;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}

function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case "createEvent":
      return <CalendarPlusIcon className="size-5" />;
    case "updateEvent":
      return <CalendarIcon className="size-5" />;
    case "deleteEvent":
      return <Trash2Icon className="size-5" />;
    case "conflictWarning":
      return <AlertTriangleIcon className="size-5" />;
    case "sendEmail":
      return <SendIcon className="size-5" />;
    case "replyToEmail":
      return <ReplyIcon className="size-5" />;
    case "createDoc":
      return <FileTextIcon className="size-5" />;
    case "appendToDoc":
      return <FilePenIcon className="size-5" />;
    case "editDoc":
      return <FileEditIcon className="size-5" />;
    default:
      return <MailIcon className="size-5" />;
  }
}

function getToolTitle(toolName: string) {
  switch (toolName) {
    case "createEvent":
      return "Create Calendar Event";
    case "updateEvent":
      return "Update Calendar Event";
    case "deleteEvent":
      return "Delete Calendar Event";
    case "conflictWarning":
      return "Scheduling Conflict Detected";
    case "sendEmail":
      return "Send Email";
    case "replyToEmail":
      return "Reply to Email";
    case "createDoc":
      return "Create Google Doc";
    case "appendToDoc":
      return "Append to Google Doc";
    case "editDoc":
      return "Edit Google Doc";
    default:
      return "Action Required";
  }
}

function getToolDescription(toolName: string) {
  switch (toolName) {
    case "createEvent":
      return "The assistant wants to create a new event on your calendar:";
    case "updateEvent":
      return "The assistant wants to update an existing event:";
    case "deleteEvent":
      return "The assistant wants to delete an event from your calendar:";
    case "conflictWarning":
      return "A scheduling conflict was found with existing events:";
    case "sendEmail":
      return "The assistant wants to send a new email:";
    case "replyToEmail":
      return "The assistant wants to reply to an email:";
    case "createDoc":
      return "The assistant wants to create a new Google Doc:";
    case "appendToDoc":
      return "The assistant wants to add content to a Google Doc:";
    case "editDoc":
      return "The assistant wants to edit a Google Doc:";
    default:
      return "The assistant wants to perform an action:";
  }
}

function formatReminderTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min before`;
  }
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours > 1 ? "s" : ""} before`;
  }
  const days = Math.round(minutes / 1440);
  return `${days} day${days > 1 ? "s" : ""} before`;
}

export function ToolApproval({
  toolName,
  input,
  approvalId,
  addToolApprovalResponse,
}: ToolApprovalProps) {
  const [open, setOpen] = useState(true);

  const handleApprove = async () => {
    console.log("Approving tool:", toolName, "with approvalId:", approvalId);
    setOpen(false);
    try {
      await addToolApprovalResponse({
        id: approvalId,
        approved: true,
      });
      console.log("Approval response sent successfully");
    } catch (error) {
      console.error("Error sending approval response:", error);
    }
  };

  const handleReject = async () => {
    console.log("Rejecting tool:", toolName, "with approvalId:", approvalId);
    setOpen(false);
    try {
      await addToolApprovalResponse({
        id: approvalId,
        approved: false,
      });
      console.log("Rejection response sent successfully");
    } catch (error) {
      console.error("Error sending rejection response:", error);
    }
  };

  const isDestructive = toolName === "deleteEvent";
  const isConflict = toolName === "conflictWarning";
  const isEmailAction = toolName === "sendEmail" || toolName === "replyToEmail";
  const isDocsAction = toolName === "createDoc" || toolName === "appendToDoc" || toolName === "editDoc";

  return (
    <Dialog.Root open={open} onOpenChange={() => {/* Prevent closing on backdrop click */}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[60vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title
            className={cn(
              "flex items-center gap-2 text-lg font-semibold",
              isDestructive && "text-destructive",
              isConflict && "text-amber-500"
            )}
          >
            {getToolIcon(toolName)}
            {getToolTitle(toolName)}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {getToolDescription(toolName)}
          </Dialog.Description>

          <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto rounded-md bg-muted p-4">
            {isDocsAction ? (
              <>
                {"title" in input && (
                  <div className="flex items-center gap-2">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">Title:</span>{" "}
                      {(input as DocCreateInput).title}
                    </p>
                  </div>
                )}
                {"content" in input && (input as DocCreateInput).content && (
                  <div className="flex items-start gap-2">
                    <FileTextIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Content:</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {(input as DocCreateInput).content}
                      </p>
                    </div>
                  </div>
                )}
                {"text" in input && (
                  <div className="flex items-start gap-2">
                    <FilePenIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Content to append:</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {(input as DocAppendInput).text}
                      </p>
                    </div>
                  </div>
                )}
                {"edits" in input && (
                  <div className="flex items-start gap-2">
                    <FileEditIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Changes:</p>
                      <ul className="list-inside list-disc space-y-1">
                        {(input as DocEditInput).edits.map((edit, i) => (
                          <li key={i} className="text-muted-foreground">
                            <span className="line-through">{edit.find}</span>
                            {" → "}
                            <span className="font-medium text-foreground">{edit.replace}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {"documentId" in input && (input as DocAppendInput | DocEditInput).documentId && (
                  <div className="text-xs text-muted-foreground">
                    Document ID: {(input as DocAppendInput | DocEditInput).documentId}
                  </div>
                )}
              </>
            ) : isEmailAction ? (
              <>
                {"to" in input && (
                  <div className="flex items-center gap-2">
                    <UsersIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">To:</span>{" "}
                      {(input as EmailSendInput).to}
                    </p>
                  </div>
                )}
                {"cc" in input && (input as EmailSendInput).cc && (
                  <div className="flex items-center gap-2">
                    <UsersIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">CC:</span>{" "}
                      {(input as EmailSendInput).cc}
                    </p>
                  </div>
                )}
                {"subject" in input && (
                  <div className="flex items-center gap-2">
                    <MailIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">Subject:</span>{" "}
                      {(input as EmailSendInput).subject}
                    </p>
                  </div>
                )}
                {"body" in input && (
                  <div className="flex items-start gap-2">
                    <MailIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Body:</p>
                      <p className="whitespace-pre-wrap break-all text-muted-foreground">
                        {(input as EmailSendInput).body}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : isConflict ? (
              <>
                <p className="text-sm">{(input as ConflictWarningInput).summary}</p>
                {(input as ConflictWarningInput).conflictingEvents.map((event, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border bg-background p-3">
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-muted-foreground">
                        {formatDateTime(event.startTime)} - {formatDateTime(event.endTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {"summary" in input && input.summary && (
                  <div className="flex items-start gap-2">
                    <CalendarIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{input.summary}</p>
                      {"description" in input && input.description && (
                        <p className="text-sm break-all text-muted-foreground">
                          {input.description}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {"startDateTime" in input && (input.startDateTime || input.endDateTime) && (
                  <div className="flex items-center gap-2">
                    <ClockIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">
                      {input.startDateTime && formatDateTime(input.startDateTime)}
                      {input.startDateTime && input.endDateTime && " - "}
                      {input.endDateTime && formatDateTime(input.endDateTime)}
                    </p>
                  </div>
                )}

                {"location" in input && input.location && (
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm">{input.location}</p>
                  </div>
                )}

                {"guests" in input && input.guests && input.guests.length > 0 && (
                  <div className="flex items-start gap-2">
                    <UsersIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Guests:</p>
                      <ul className="list-inside list-disc">
                        {input.guests.map((guest, i) => (
                          <li key={i}>
                            {guest.displayName || guest.email}
                            {guest.optional && " (optional)"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {"reminders" in input && input.reminders && input.reminders.length > 0 && (
                  <div className="flex items-start gap-2">
                    <BellIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">Reminders:</p>
                      <ul className="list-inside list-disc">
                        {input.reminders.map((reminder, i) => (
                          <li key={i}>
                            {reminder.method === "popup" ? "Notification" : "Email"}{" "}
                            {formatReminderTime(reminder.minutes)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {"eventId" in input && input.eventId && (
                  <div className="text-xs text-muted-foreground">
                    Event ID: {input.eventId}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-auto flex shrink-0 justify-end gap-3 pt-6">
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              <XIcon className="size-4" />
              {isConflict ? "Choose Different Time" : "Reject"}
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
                isDestructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : isConflict
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <CheckIcon className="size-4" />
              {isConflict ? "Create Anyway" : "Approve"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
