import { ToolsName } from "./types";
import { SquareTerminal, File, FileText, FilePenLine } from "@lucide/vue";

export const TOOLS_NAME_ICON_MAPS: Record<string, Component> = {
  [ToolsName.LIST_FILE]: File,
  [ToolsName.WRITE_FILE]: FilePenLine,
  [ToolsName.READ_FILE]: FileText,
  [ToolsName.APPLY_PATCH]: File,
  [ToolsName.EXEC_COMMAND]: SquareTerminal,
  [ToolsName.GIT_DIFF]: SquareTerminal,
  [ToolsName.GIT_LOG]: SquareTerminal,
  [ToolsName.GIT_STATUS]: SquareTerminal,
};
