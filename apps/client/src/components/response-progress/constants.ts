import { ToolsName } from "./types";
import { SquareTerminal, File } from "@lucide/vue";

export const TOOLS_NAME_ICON_MAPS: Record<string, Component> = {
  [ToolsName.LIST_FILE]: File,
  [ToolsName.WRITE_FILE]: File,
  [ToolsName.READ_FILE]: File,
  [ToolsName.EXEC_COMMAND]: SquareTerminal,
};
