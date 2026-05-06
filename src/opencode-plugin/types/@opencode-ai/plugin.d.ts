/**
 * Type declarations for @opencode-ai/plugin peer dependency.
 * These are fallback declarations used when @opencode-ai/plugin is not installed.
 * They mirror the actual SDK types from @opencode-ai/plugin@1.14.29.
 */

declare module "@opencode-ai/plugin" {
  // Minimal declarations for the surface area used by the CodeSpec plugin.
  // The actual SDK has much richer types.

  interface Client {
    session: {
      todo(args: { path: { id: string } }): Promise<unknown>;
      promptAsync(args: {
        path: { id: string };
        body: {
          parts: Array<{ type: string; text: string }>;
          agent?: string;
          model?: { providerID: string; modelID: string };
          tools?: { [key: string]: boolean };
        };
        query?: { directory?: string };
      }): Promise<unknown>;
      messages(args: { path: { id: string } }): Promise<unknown>;
    };
  }

  interface PluginInput {
    client: Client;
    project: { id: string; worktree: string };
    directory: string;
    worktree: string;
  }

  interface Hooks {
    event?: (input: { event: { type: string; properties?: unknown } }) => Promise<void>;
    "experimental.chat.messages.transform"?: (input: Record<string, unknown>, output: { messages: Array<{ info: { id: string; sessionID: string; role: string; time: { created: number } }; parts: Array<{ type: string; text?: string; callID?: string; tool?: string; state?: { status: string; output?: string; input?: unknown } }> }> }) => Promise<void>;
    "experimental.chat.system.transform"?: (input: { sessionID?: string }, output: { system: string[] }) => Promise<void>;
    tool?: { [key: string]: any };
  }

  type Plugin = (
    input: PluginInput,
    options?: Record<string, unknown>,
  ) => Promise<Hooks>;
}

declare module "@opencode-ai/sdk" {
  export type Event = {
    type: string;
    properties?: Record<string, unknown>;
  };
}
