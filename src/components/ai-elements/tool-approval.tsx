"use client";

import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarPlusIcon,
  CalendarIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  ClockIcon,
  MapPinIcon,
  UsersIcon,
  BellIcon,
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

interface ToolApprovalProps {
  toolName: string;
  input: CalendarEventInput;
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
    default:
      return <CalendarIcon className="size-5" />;
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
    default:
      return "Calendar Action";
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
    default:
      return "The assistant wants to perform a calendar action:";
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

  return (
    <Dialog.Root open={open} onOpenChange={() => {/* Prevent closing on backdrop click */}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title
            className={cn(
              "flex items-center gap-2 text-lg font-semibold",
              isDestructive && "text-destructive"
            )}
          >
            {getToolIcon(toolName)}
            {getToolTitle(toolName)}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {getToolDescription(toolName)}
          </Dialog.Description>

          <div className="mt-4 space-y-3 rounded-md bg-muted p-4">
            {input.summary && (
              <div className="flex items-start gap-2">
                <CalendarIcon className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{input.summary}</p>
                  {input.description && (
                    <p className="text-sm text-muted-foreground">
                      {input.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(input.startDateTime || input.endDateTime) && (
              <div className="flex items-center gap-2">
                <ClockIcon className="size-4 text-muted-foreground" />
                <p className="text-sm">
                  {input.startDateTime && formatDateTime(input.startDateTime)}
                  {input.startDateTime && input.endDateTime && " - "}
                  {input.endDateTime && formatDateTime(input.endDateTime)}
                </p>
              </div>
            )}

            {input.location && (
              <div className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-muted-foreground" />
                <p className="text-sm">{input.location}</p>
              </div>
            )}

            {input.guests && input.guests.length > 0 && (
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

            {input.reminders && input.reminders.length > 0 && (
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

            {input.eventId && (
              <div className="text-xs text-muted-foreground">
                Event ID: {input.eventId}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              <XIcon className="size-4" />
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
                isDestructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <CheckIcon className="size-4" />
              Approve
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
