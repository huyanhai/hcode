import type { AgentEvent } from "@earendil-works/pi-durable";

/**
 * Events that are not part of Pi's durable agent stream.
 *
 * These are deliberately namespaced so the transport can carry the few hcode
 * concerns (approval UI and HTTP stream settlement) without re-wrapping Pi's
 * message and tool events in a second protocol.
 */
export type HcodeApprovalEvent = {
  type: "hcode.approval_requested";
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type HcodeDoneEvent = {
  type: "hcode.done";
  text: string;
  awaitingApproval: boolean;
};

export type HcodeErrorEvent = {
  type: "hcode.error";
  message: string;
};

/** The SSE payload: Pi AgentEvent plus only the required hcode extensions. */
export type PiStreamEvent =
  | AgentEvent
  | HcodeApprovalEvent
  | HcodeDoneEvent
  | HcodeErrorEvent;
