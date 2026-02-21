import type { Tool } from "ai";

/** All supported routing destinations */
export type AgentRoute =
  | "calendar_only"
  | "gmail_only"
  | "gmail_then_cal"
  | "general";

/** Context passed to agent configuration functions */
export interface AgentContext {
  googleConnected: boolean;
  /** Injected results from a prior agent in a chain */
  priorAgentResult?: string;
  /** Any additional dynamic context (e.g., conflict info) */
  additionalContext?: string;
}

/** Result of agent pre-processing (e.g., conflict detection) */
export interface PreProcessResult {
  additionalContext: string;
  /** Force a specific tool to be called */
  forceToolChoice?: { type: "tool"; toolName: string };
}

/** Configuration for a single agent persona */
export interface AgentConfig {
  id: string;
  name: string;
  getSystemPrompt: (context: AgentContext) => string;
  getTools: (context: AgentContext) => Record<string, Tool> | undefined;
  preProcess?: (
    context: AgentContext,
    extra: { messages: import("ai").UIMessage[] }
  ) => Promise<PreProcessResult>;
}

/** Result of intent classification */
export interface ClassificationResult {
  route: AgentRoute;
  reasoning: string;
}
