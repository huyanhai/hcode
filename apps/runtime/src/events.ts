import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  watchEvents,
  type AgentEvent,
  type Harness,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { pause } from "./documents.js";
import type { HcodeApprovalEvent, PiStreamEvent } from "./stream-protocol.js";

/** SSE is only a live observation; a disconnected client never aborts submitted Pi work. */
export async function observeSubmission(
  harness: Harness,
  conversationId: Parameters<Harness["conversation"]>[0],
  submissionId: SubmissionId,
  emit: (event: PiStreamEvent) => void,
  pendingApproval: () => Promise<Omit<HcodeApprovalEvent, "type"> | undefined>,
  latestAnswer: () => Promise<string>,
  signal?: AbortSignal,
): Promise<{ text: string; awaitingApproval: boolean }> {
  const submission = await harness.submission(submissionId, BACKGROUND_CONTEXT);
  if (!submission) throw new Error("消息不存在");
  const stream = await watchEvents(harness, conversationId, BACKGROUND_CONTEXT);
  let answer = "";
  stream.start(async (events: readonly AgentEvent[]) => {
    for (const event of events) {
      // Pi's durable event is the wire contract. Keep only a local answer
      // accumulator for the fallback used when a fast run beats the watcher.
      if (event.type === "message_update")
        for (const change of event.changes)
          if (change.type === "text_delta") answer += change.delta;
      emit(event);
    }
  });
  try {
    while (!signal?.aborted) {
      const status = await submission.status(BACKGROUND_CONTEXT);
      if (status.status === "done" || status.status === "unanswered") {
        const finalText = (await latestAnswer()) || answer;
        // A fast generation can finish before watchEvents starts. Fill the missing suffix from committed entries.
        if (finalText.startsWith(answer) && finalText.length > answer.length)
          emit({
            type: "message_update",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            changes: [
              {
                type: "text_delta",
                contentIndex: 0,
                delta: finalText.slice(answer.length),
              },
            ],
          });
        return { text: finalText, awaitingApproval: false };
      }
      const pending = await pendingApproval();
      if (pending) {
        emit({ type: "hcode.approval_requested", ...pending });
        return { text: answer, awaitingApproval: true };
      }
      await pause(100);
    }
    return { text: answer, awaitingApproval: false };
  } finally {
    await stream.stop();
  }
}
