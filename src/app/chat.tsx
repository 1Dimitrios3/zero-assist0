"use client";

import { Action, Actions } from "@/components/ai-elements/actions";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { ToolApproval } from "@/components/ai-elements/tool-approval";
import { useChat } from "@ai-sdk/react";
import { CheckIcon, CopyIcon, RefreshCcwIcon } from "lucide-react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';


import { useRef, useState } from "react";
import { isToolPart, isTextPart, needsApproval, MessagePart } from "@/types/messages";

export const Chat = () => {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    sendMessage,
    status,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    generateId: () => crypto.randomUUID(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage({
      text: message.text || "Sent with attachments",
      files: message.files,
    });

    setInput("");
  };
  return (
    <div className="relative flex-1 items-center flex flex-col min-h-0 w-full">
      <Conversation className="w-full">
        <ConversationContent className="max-w-4xl mx-auto w-full pb-40">
          {messages.map((message) => (
            <div key={message.id}>
              {message.parts.map((part, i) => {
                const typedPart = part as MessagePart;

                // Handle tool parts that need approval
                if (isToolPart(typedPart) && needsApproval(typedPart)) {
                  const toolName = typedPart.type.replace("tool-", "");
                  return (
                    <ToolApproval
                      key={`${message.id}-${i}`}
                      toolName={toolName}
                      input={typedPart.input}
                      approvalId={typedPart.approval!.id}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
                  );
                }

                // Handle text parts
                if (isTextPart(typedPart)) {
                  return (
                    <div key={`${message.id}-${i}`}>
                      <Message from={message.role}>
                        <MessageContent>
                          <Response>{typedPart.text}</Response>
                        </MessageContent>
                      </Message>
                      {message.role === "assistant" && (
                        <Actions className="mt-2">
                          {message.id === messages.at(-1)?.id && (
                            <Action onClick={() => regenerate()} label="Retry">
                              <RefreshCcwIcon className="size-3" />
                            </Action>
                          )}
                          <Action
                            onClick={() => handleCopy(typedPart.text, message.id)}
                            label="Copy"
                          >
                            {copiedId === message.id ? (
                              <CheckIcon className="size-3 text-green-500" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                          </Action>
                        </Actions>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}
          {status === "submitted" && <Loader />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="absolute bottom-0 flex items-center justify-center w-full sm:px-6 px-5">
        <PromptInput
          onSubmit={handleSubmit}
          className="mb-4"
          globalDrop
          multiple
        >
          <PromptInputBody>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
            <PromptInputTextarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
              ref={textareaRef}
              autoFocus
            />
          </PromptInputBody>
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input && !status} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};
