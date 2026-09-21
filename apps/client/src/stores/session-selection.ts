import { useLocalStorage } from "@vueuse/core";

const selectedSessionId = useLocalStorage<string>(
  "hcode:selected-session-id",
  "",
);

export function useSessionSelection() {
  return selectedSessionId;
}
