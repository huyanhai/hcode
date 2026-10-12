import { defineStore } from "pinia";
import { ref } from "vue";
import type { ConfirmedWebAnnotation } from "@hcode/web-annotation";

export interface PendingWebAnnotation {
  sessionId: string;
  result: ConfirmedWebAnnotation;
}

export const useWebAnnotationStore = defineStore("web-annotation", () => {
  const pending = ref<PendingWebAnnotation[]>([]);
  function enqueue(sessionId: string, result: ConfirmedWebAnnotation): void {
    pending.value.push({ sessionId, result });
  }
  function shift(): PendingWebAnnotation | undefined {
    return pending.value.shift();
  }
  return { pending, enqueue, shift };
});
