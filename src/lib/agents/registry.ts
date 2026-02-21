import type { AgentConfig, AgentRoute } from "./types";
import { calendarAgentConfig } from "./calendar/prompt";

const generalAgentConfig: AgentConfig = {
  id: "general",
  name: "General Assistant",
  getSystemPrompt: () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const formattedDate = now.toLocaleDateString("en-US", options);

    return `You are a helpful AI assistant. You can help with general questions and conversation.

Current date: ${formattedDate}

You have access to calendar management capabilities. If the user asks about email/Gmail features, let them know that email integration is coming soon.`;
  },
  getTools: () => undefined,
};

/** Map of route to ordered list of agent configs to execute */
const routeMap: Record<AgentRoute, AgentConfig[]> = {
  calendar_only: [calendarAgentConfig],
  general: [generalAgentConfig],
  // Stubs until Gmail agent is implemented
  gmail_only: [generalAgentConfig],
  gmail_then_cal: [generalAgentConfig],
};

export function getAgentPipeline(route: AgentRoute): AgentConfig[] {
  return routeMap[route] ?? [generalAgentConfig];
}

export function getAvailableRoutes(): AgentRoute[] {
  return Object.keys(routeMap) as AgentRoute[];
}
