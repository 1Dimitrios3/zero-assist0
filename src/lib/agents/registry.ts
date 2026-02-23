import type { AgentConfig, AgentRoute } from "./types";
import { getCurrentDateInfo } from "./utils";
import { calendarAgentConfig } from "./calendar/prompt";
import { emailAgentConfig } from "./email/prompt";

const generalAgentConfig: AgentConfig = {
  id: "general",
  name: "General Assistant",
  getSystemPrompt: () => {
    const dateInfo = getCurrentDateInfo();

    return `You are a helpful AI assistant. You can help with general questions and conversation.

${dateInfo}

You have access to calendar and email capabilities. If the user asks about calendar or email features, let them know they can connect their Google account at /api/auth/google.`;
  },
  getTools: () => undefined,
};

/** Map of route to ordered list of agent configs to execute */
const routeMap: Record<AgentRoute, AgentConfig[]> = {
  calendar_only: [calendarAgentConfig],
  general: [generalAgentConfig],
  gmail_only: [emailAgentConfig],
  gmail_then_cal: [emailAgentConfig, calendarAgentConfig],
};

export function getAgentPipeline(route: AgentRoute): AgentConfig[] {
  return routeMap[route] ?? [generalAgentConfig];
}

export function getAvailableRoutes(): AgentRoute[] {
  return Object.keys(routeMap) as AgentRoute[];
}
