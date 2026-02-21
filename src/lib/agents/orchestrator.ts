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
import { isAuthenticated } from "../google-calendar";
import { MODEL_ID, MAX_TOOL_STEPS } from "@/app/api/chat/prompts";
import type { AgentContext } from "./types";

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

  // --- Phase 1: Classify Intent ---
  const lastUserText = getLastUserText(messages);
  const route = lastUserText
    ? (await classifyIntent(lastUserText, getAvailableRoutes())).route
    : "general";

  console.log("[orchestrator] route:", route);

  const pipeline = getAgentPipeline(route);

  // --- Phase 2: Execute Pipeline ---
  const context: AgentContext = {
    googleConnected,
  };

  // Run pre-processing for the final agent (e.g., conflict detection)
  const finalAgent = pipeline[pipeline.length - 1];
  let forceToolChoice: { type: "tool"; toolName: string } | undefined;

  if (finalAgent.preProcess) {
    const preResult = await finalAgent.preProcess(context, { messages });
    context.additionalContext = preResult.additionalContext;
    forceToolChoice = preResult.forceToolChoice;
  }

  // Execute non-final agents headlessly (for chained pipelines like gmail_then_cal)
  if (pipeline.length > 1) {
    for (let i = 0; i < pipeline.length - 1; i++) {
      const agent = pipeline[i];
      const headlessMessages = await convertToModelMessages(messages);
      const result = await generateText({
        model: openai(MODEL_ID as string),
        system: agent.getSystemPrompt(context),
        messages: headlessMessages,
        tools: agent.getTools(context),
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
      });
      // Feed result into next agent as context
      context.priorAgentResult = result.text;
    }
  }

  // Execute final agent with streaming (supports tool approvals)
  const modelMessages = await convertToModelMessages(messages);

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
