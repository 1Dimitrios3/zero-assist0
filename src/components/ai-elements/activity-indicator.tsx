"use client";

import { isToolPart, isTextPart, type MessagePart } from "@/types/messages";
import { CalendarIcon, MailIcon, FileTextIcon } from "lucide-react";
import type { UIMessage } from "ai";
import type { ComponentType, SVGProps } from "react";

type ActivityIndicatorProps = {
  status: "submitted" | "streaming" | "ready" | "error";
  messages: UIMessage[];
};

type ToolLabel = {
  text: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
};

const toolLabelMap: Record<string, ToolLabel> = {
  listEvents: { text: "Checking your calendar...", icon: CalendarIcon },
  searchEvents: { text: "Checking your calendar...", icon: CalendarIcon },
  createEvent: { text: "Preparing calendar changes...", icon: CalendarIcon },
  updateEvent: { text: "Preparing calendar changes...", icon: CalendarIcon },
  deleteEvent: { text: "Preparing calendar changes...", icon: CalendarIcon },
  listEmails: { text: "Reading your emails...", icon: MailIcon },
  searchEmails: { text: "Reading your emails...", icon: MailIcon },
  readEmail: { text: "Reading your emails...", icon: MailIcon },
  sendEmail: { text: "Composing email...", icon: MailIcon },
  replyToEmail: { text: "Composing email...", icon: MailIcon },
  listDocs: { text: "Searching your documents...", icon: FileTextIcon },
  searchDocs: { text: "Searching your documents...", icon: FileTextIcon },
  readDoc: { text: "Searching your documents...", icon: FileTextIcon },
  createDoc: { text: "Preparing document changes...", icon: FileTextIcon },
  appendToDoc: { text: "Preparing document changes...", icon: FileTextIcon },
  editDoc: { text: "Preparing document changes...", icon: FileTextIcon },
};

const defaultLabel: ToolLabel = { text: "Working on it...", icon: FileTextIcon };

function getToolLabel(messages: UIMessage[]): ToolLabel | null {
  const lastMsg = messages.at(-1);
  if (lastMsg?.role !== "assistant") return null;

  for (let i = lastMsg.parts.length - 1; i >= 0; i--) {
    const part = lastMsg.parts[i] as MessagePart;
    if (isToolPart(part)) {
      const toolName = part.type.replace("tool-", "");
      return toolLabelMap[toolName] ?? defaultLabel;
    }
  }
  return null;
}

function hasVisibleText(messages: UIMessage[]): boolean {
  const lastMsg = messages.at(-1);
  return (
    lastMsg?.role === "assistant" &&
    lastMsg.parts.some(
      (p) =>
        isTextPart(p as MessagePart) &&
        (p as MessagePart & { text: string }).text?.trim()
    )
  ) ?? false;
}

export function ActivityIndicator({ status, messages }: ActivityIndicatorProps) {
  if (status === "ready" || status === "error") return null;
  if (status === "streaming" && hasVisibleText(messages)) return null;

  const toolLabel = status === "streaming" ? getToolLabel(messages) : null;
  const Icon = toolLabel?.icon ?? null;
  const label = toolLabel?.text ?? "Thinking...";

  return (
    <div className="flex items-center gap-3 py-4 px-1 animate-[fade-in_0.3s_ease-out]">
      <span className="relative flex size-5 items-center justify-center">
        <span className="absolute size-5 rounded-full bg-primary/20 animate-[breathe_2s_ease-in-out_infinite]" />
        <span className="absolute size-3.5 rounded-full bg-primary/30 animate-[breathe_2s_ease-in-out_0.3s_infinite]" />
        <span className="absolute size-2 rounded-full bg-primary/50 animate-[breathe_2s_ease-in-out_0.6s_infinite]" />
      </span>
      <span
        key={label}
        className="flex items-center gap-1.5 text-sm text-muted-foreground animate-[fade-in_0.3s_ease-out]"
      >
        {Icon && <Icon className="size-3.5 animate-[shimmer_2s_ease-in-out_infinite]" />}
        <span className="animate-[shimmer_2s_ease-in-out_infinite]">{label}</span>
      </span>
    </div>
  );
}
