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
import {
  stripToolPartsFromMessages,
  deduplicateModelMessages,
  extractDocMetadataFromSteps,
  stripToolApprovals,
  recoverDocMetadata,
  getRecentContext,
  hasDocContextInConversation,
  isToolApprovalContinuation,
  getLastUserText,
} from "./utils";

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
    : { calendar: false, gmail: false, docs: false };

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
    docsConnected: services.docs,
    userName: userName ?? undefined,
  };

  const finalAgent = pipeline[pipeline.length - 1];
  let forceToolChoice: { type: "tool"; toolName: string } | undefined;

  // Execute non-final agents headlessly FIRST (for chained pipelines like gmail_then_cal)
  // This must happen before preProcess so the final agent has full context.
  // Skip if this is a tool-approval continuation (assistant already responded
  // after the last user message) — headless agents have already run.
  const approvalContinuation = isToolApprovalContinuation(messages);
  if (approvalContinuation) {
    console.log("[orchestrator] skipping headless agents (approval continuation)");

    // Recover doc metadata for the final agent's context — headless results
    // are ephemeral and lost between requests. Fetch the most recently modified
    // doc so the final agent still has the webViewLink.
    if (pipeline.length > 1 && pipeline.some((a) => a.id === "docs") && services.docs) {
      const docMeta = await recoverDocMetadata();
      if (docMeta) {
        context.priorAgentResult = docMeta;
      }
    }
  }

  // Recover doc metadata for single-agent calendar routes that follow a
  // chained docs_then_cal pipeline (e.g., user provides a new time after
  // a conflict rejection). The doc link is ephemeral and lost between
  // requests, so we re-fetch the most recent doc.
  if (
    pipeline.length === 1 &&
    finalAgent.id === "calendar" &&
    services.docs &&
    !approvalContinuation &&
    hasDocContextInConversation(messages)
  ) {
    const docMeta = await recoverDocMetadata();
    if (docMeta) {
      context.priorAgentResult = docMeta;
      console.log("[orchestrator] recovered doc metadata for calendar follow-up");
    }
  }

  if (pipeline.length > 1 && !approvalContinuation) {
    const textOnlyMessages = stripToolPartsFromMessages(messages);

    for (let i = 0; i < pipeline.length - 1; i++) {
      const agent = pipeline[i];

      try {
        const rawHeadlessMessages = await convertToModelMessages(textOnlyMessages);
        const headlessMessages = deduplicateModelMessages(rawHeadlessMessages);
        const result = await generateText({
          model: openai(MODEL_ID as string),
          system: agent.getSystemPrompt(context),
          messages: headlessMessages,
          tools: stripToolApprovals(agent.getTools(context)),
          stopWhen: stepCountIs(MAX_TOOL_STEPS),
        });
        // Feed result into next agent as context
        context.priorAgentResult = result.text;

        // Append structured doc metadata so the next agent has reliable
        // access to document links (LLM text output may omit them)
        if (agent.id === "docs") {
          const docMeta = extractDocMetadataFromSteps(result.steps);
          if (docMeta) {
            context.priorAgentResult += docMeta;
          }
        }
      } catch (error) {
        console.error(`[orchestrator] Headless agent "${agent.id}" failed:`, error);
        context.priorAgentResult = `[The ${agent.name} encountered an error and could not complete its task. Please let the user know and suggest they try again.]`;
      }
    }
  }

  // Run pre-processing for the final agent (e.g., conflict detection).
  // Runs for both single-agent and chained pipelines — the user may specify
  // event times directly even in chained requests (e.g., "create a doc and
  // schedule an event at 1pm").
  if (finalAgent.preProcess) {
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
