import { useLocalStorage } from "@vueuse/core";

const selectedSessionId = useLocalStorage<string>(
  "hcode:selected-session-id",
  "",
);
const activeSessionId = ref<string>("");

export function useSessionSelection() {
  return selectedSessionId;
}

export function useSessionActivity() {
  return activeSessionId;
}
