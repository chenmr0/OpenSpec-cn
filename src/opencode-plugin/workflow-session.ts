export const PLAN_MARKER = "codespec-propose";
export const APPLY_MARKER = "codespec-apply-change";

export type ProtectedWorkflow = "plan" | "apply";

const PROTECTED_COMMAND_MARKERS: Array<{
  workflow: ProtectedWorkflow;
  marker: string;
}> = [
  { workflow: "apply", marker: APPLY_MARKER },
  { workflow: "plan", marker: PLAN_MARKER },
];

interface MessageLike {
  info?: {
    role?: string;
    sessionID?: string;
  };
  parts?: Array<{
    type?: string;
    text?: string;
  }>;
}

export interface ProtectedWorkflowSession {
  workflow: ProtectedWorkflow;
  detectedAt: number;
}

export interface WorkflowSessionStore {
  markProtectedSession: (sessionID: string, workflow: ProtectedWorkflow) => void;
  getProtectedSession: (sessionID: string) => ProtectedWorkflowSession | undefined;
  isProtectedSession: (sessionID: string) => boolean;
  cleanup: (sessionID: string) => void;
}

export function createWorkflowSessionStore(): WorkflowSessionStore {
  const sessions = new Map<string, ProtectedWorkflowSession>();

  return {
    markProtectedSession(sessionID: string, workflow: ProtectedWorkflow): void {
      sessions.set(sessionID, { workflow, detectedAt: Date.now() });
    },

    getProtectedSession(sessionID: string): ProtectedWorkflowSession | undefined {
      return sessions.get(sessionID);
    },

    isProtectedSession(sessionID: string): boolean {
      return sessions.has(sessionID);
    },

    cleanup(sessionID: string): void {
      sessions.delete(sessionID);
    },
  };
}

export function detectProtectedWorkflowFromMessages(
  messages: MessageLike[],
): ProtectedWorkflow | null {
  for (const msg of messages) {
    if (msg.info?.role !== "user") continue;

    for (const part of msg.parts ?? []) {
      if (part.type !== "text" || !part.text) continue;

      for (const { workflow, marker } of PROTECTED_COMMAND_MARKERS) {
        if (part.text.includes(marker)) {
          return workflow;
        }
      }
    }
  }

  return null;
}

export function recordProtectedWorkflowSessionFromMessages(
  store: WorkflowSessionStore,
  messages: MessageLike[],
): ProtectedWorkflow | null {
  const sessionID = messages.find((msg) => msg.info?.sessionID)?.info?.sessionID;
  if (!sessionID) return null;

  const workflow = detectProtectedWorkflowFromMessages(messages);
  if (workflow) {
    store.markProtectedSession(sessionID, workflow);
  }

  return workflow;
}
