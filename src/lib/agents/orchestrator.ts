import {
  UIMessage,
  convertToModelMessages,
  streamText,
  generateText,
  stepCountIs,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { classifyIntent } from "./classifier";
import { getAgentPipeline, getAvailableRoutes } from "./registry";
import { isAuthenticated, getGrantedServices, getUserName } from "../google-auth";
import { MODEL_ID, MAX_TOOL_STEPS } from "@/app/api/chat/prompts";
import type { AgentContext } from "./types";
import { stripToolPartsFromMessages, deduplicateModelMessages } from "./utils";

export interface OrchestratorResult {
  stream: ReturnType<typeof streamText>;
}

/**
 * Main orchestration function.
 *
 * Phase 1: Classify intent (fast gpt-4o-mini call)
 * Phase 2: Execute the appropriate agent pipeline
 *
 * For single-agent routes, streams directly.
 * For chained routes (e.g., gmail_then_cal), runs non-final agents
 * with generateText() and feeds results into the final streaming agent.
 */
export async function orchestrate(
  messages: UIMessage[]
): Promise<OrchestratorResult> {
  const googleConnected = isAuthenticated();
  const services = googleConnected
    ? getGrantedServices()
    : { calendar: false, gmail: false };

  // --- Phase 1: Classify Intent ---
  const lastUserText = getLastUserText(messages);
  const conversationContext = getRecentContext(messages);
  const route = lastUserText
    ? (await classifyIntent(lastUserText, getAvailableRoutes(), conversationContext)).route
    : "general";

  console.log("[orchestrator] route:", route);

  const pipeline = getAgentPipeline(route);

  // --- Phase 2: Execute Pipeline ---
  const userName = googleConnected ? await getUserName() : null;

  const context: AgentContext = {
    googleConnected,
    calendarConnected: services.calendar,
    gmailConnected: services.gmail,
    userName: userName ?? undefined,
  };

  const finalAgent = pipeline[pipeline.length - 1];
  let forceToolChoice: { type: "tool"; toolName: string } | undefined;

  // Execute non-final agents headlessly FIRST (for chained pipelines like gmail_then_cal)
  // This must happen before preProcess so the final agent has full context
  if (pipeline.length > 1) {
    const textOnlyMessages = stripToolPartsFromMessages(messages);

    for (let i = 0; i < pipeline.length - 1; i++) {
      const agent = pipeline[i];
      try {
        const headlessMessages = await convertToModelMessages(textOnlyMessages);
        const result = await generateText({
          model: openai(MODEL_ID as string),
          system: agent.getSystemPrompt(context),
          messages: headlessMessages,
          tools: agent.getTools(context),
          stopWhen: stepCountIs(MAX_TOOL_STEPS),
        });
        // Feed result into next agent as context
        context.priorAgentResult = result.text;
      } catch (error) {
        console.error(`[orchestrator] Headless agent "${agent.id}" failed:`, error);
        context.priorAgentResult = `[The ${agent.name} encountered an error and could not complete its task. Please let the user know and suggest they try again.]`;
      }
    }
  }

  // Run pre-processing for the final agent (e.g., conflict detection)
  // Skipped for chained pipelines — event details come from prior agent output,
  // not from the user message. Conflict detection runs on the follow-up request
  // when the user explicitly asks to book/create the event (a calendar_only route).
  if (finalAgent.preProcess && pipeline.length === 1) {
    const preResult = await finalAgent.preProcess(context, { messages });
    context.additionalContext = preResult.additionalContext;
    forceToolChoice = preResult.forceToolChoice;
  }

  // Execute final agent with streaming (supports tool approvals)
  const rawModelMessages = await convertToModelMessages(messages);
  const modelMessages = deduplicateModelMessages(rawModelMessages);

  const stream = streamText({
    model: openai(MODEL_ID as string),
    system: finalAgent.getSystemPrompt(context),
    messages: modelMessages,
    tools: finalAgent.getTools(context),
    toolChoice: forceToolChoice,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  });

  return { stream };
}

/**
 * Extracts recent conversation context (last few exchanges) for the classifier.
 * Returns a summary of the last 2-3 user/assistant text exchanges.
 */
function getRecentContext(messages: UIMessage[]): string | undefined {
  const recent: string[] = [];
  let count = 0;

  // Walk backwards, collect up to 3 recent text exchanges (excluding the last user message)
  for (let i = messages.length - 2; i >= 0 && count < 3; i--) {
    const msg = messages[i];
    const textParts = msg.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");

    if (textParts) {
      recent.unshift(`${msg.role}: ${textParts.slice(0, 300)}`);
      count++;
    }
  }

  return recent.length > 0 ? recent.join("\n") : undefined;
}

/**
 * Extracts the text content from the last user message.
 */
function getLastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return (
        messages[i].parts
          ?.filter(
            (p): p is { type: "text"; text: string } => p.type === "text"
          )
          .map((p) => p.text)
          .join(" ") ?? null
      );
    }
  }
  return null;
}
