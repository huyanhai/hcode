import { z } from "zod";

export const commandTypeSchema = z.enum([
  "profile/list",
  "profile/upsert",
  "profile/delete",
  "workspace/list",
  "workspace/upsert",
  "session/list",
  "session/create",
  "session/open",
  "turn/start",
  "turn/interrupt",
  "approval/respond",
]);

export const permissionModeSchema = z.enum(["restricted", "full"]);

export const agentEventTypeSchema = z.enum([
  "runtime/ready",
  "runtime/error",
  "profile/changed",
  "session/changed",
  "turn/started",
  "message/delta",
  "message/completed",
  "tool/call-created",
  "tool/progress",
  "tool/completed",
  "approval/requested",
  "approval/responded",
  "turn/completed",
  "turn/failed",
  "turn/interrupted",
]);

const commandBase = { requestId: z.string().min(1) };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...commandBase, type: z.literal("profile/list"), payload: z.object({}).optional() }),
  z.object({ ...commandBase, type: z.literal("profile/upsert"), payload: z.object({ id: z.string().optional(), name: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), baseUrl: z.url(), apiKey: z.string().min(1).optional(), isDefault: z.boolean().optional() }) }),
  z.object({ ...commandBase, type: z.literal("profile/delete"), payload: z.object({ id: z.string().min(1) }) }),
  z.object({ ...commandBase, type: z.literal("workspace/list"), payload: z.object({}).optional() }),
  z.object({ ...commandBase, type: z.literal("workspace/upsert"), payload: z.object({ id: z.string().optional(), path: z.string().min(1), name: z.string().min(1).optional() }) }),
  z.object({ ...commandBase, type: z.literal("session/list"), payload: z.object({ workspaceId: z.string().optional() }).optional() }),
  z.object({ ...commandBase, type: z.literal("session/create"), payload: z.object({ workspaceId: z.string().min(1), title: z.string().min(1).optional() }) }),
  z.object({ ...commandBase, type: z.literal("session/open"), payload: z.object({ sessionId: z.string().min(1) }) }),
  z.object({ ...commandBase, type: z.literal("turn/start"), payload: z.object({ sessionId: z.string().min(1), profileId: z.string().min(1), content: z.string().min(1), permissionMode: permissionModeSchema.optional() }) }),
  z.object({ ...commandBase, type: z.literal("turn/interrupt"), payload: z.object({ turnId: z.string().min(1) }) }),
  z.object({ ...commandBase, type: z.literal("approval/respond"), payload: z.object({ approvalId: z.string().min(1), approved: z.boolean(), reason: z.string().optional() }) }),
]);

export const agentEventSchema = z.object({
  eventId: z.string(),
  sessionId: z.string().optional(),
  turnId: z.string().optional(),
  sequence: z.number().int().nonnegative().optional(),
  type: agentEventTypeSchema,
  payload: z.unknown().optional(),
  createdAt: z.number().int(),
});

export const modelProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  isDefault: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const modelProfileSummarySchema = modelProfileSchema
  .omit({ apiKey: true })
  .extend({ apiKeyHint: z.string().nullable() });

export const workspaceSchema = z.object({
  id: z.string(),
  path: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number().int(),
  lastOpenedAt: z.number().int(),
});

export const sessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  status: z.enum(["active", "archived"]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const messageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string().nullable(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  sequence: z.number().int(),
  createdAt: z.number().int(),
});

export type CommandType = z.infer<typeof commandTypeSchema>;
export type AgentEventType = z.infer<typeof agentEventTypeSchema>;
export type Command = { requestId: string; type: CommandType; payload?: unknown };
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type ModelProfile = z.infer<typeof modelProfileSchema>;
export type ModelProfileSummary = z.infer<typeof modelProfileSummarySchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Message = z.infer<typeof messageSchema>;

export type StartTurnPayload = Extract<z.infer<typeof commandSchema>, { type: "turn/start" }>["payload"];
export type ApprovalResponsePayload = Extract<z.infer<typeof commandSchema>, { type: "approval/respond" }>["payload"];

export type RuntimeResponse = {
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

export function createEvent(
  type: AgentEventType,
  payload: unknown,
  ids: { sessionId?: string; turnId?: string; sequence?: number } = {},
): AgentEvent {
  return {
    eventId: crypto.randomUUID(),
    type,
    payload,
    createdAt: Date.now(),
    ...ids,
  };
}
