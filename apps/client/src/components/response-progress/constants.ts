import { ToolsName } from "./types";
import {
  SquareTerminal,
  File,
  FileText,
  FilePenLine,
  Search,
} from "@lucide/vue";

export const TOOLS_NAME_ICON_MAPS: Record<string, Component> = {
  [ToolsName.LIST_FILE]: File,
  [ToolsName.WRITE_FILE]: FilePenLine,
  [ToolsName.READ_FILE]: FileText,
  [ToolsName.APPLY_PATCH]: File,
  [ToolsName.EXEC_COMMAND]: SquareTerminal,
  [ToolsName.SEARCH_FILES]: Search,
  [ToolsName.GIT_DIFF]: SquareTerminal,
  [ToolsName.GIT_LOG]: SquareTerminal,
  [ToolsName.GIT_STATUS]: SquareTerminal,
};

export const TOOLS_NAME_MAPS: Record<string, string> = {
  [ToolsName.LIST_FILE]: "查看",
  [ToolsName.WRITE_FILE]: "编辑",
  [ToolsName.READ_FILE]: "查看",
  [ToolsName.APPLY_PATCH]: "补丁",
  [ToolsName.EXEC_COMMAND]: "执行",
  [ToolsName.SEARCH_FILES]: "搜索",
  [ToolsName.GIT_DIFF]: "git diff",
  [ToolsName.GIT_LOG]: "git log",
  [ToolsName.GIT_STATUS]: "git status",
};
