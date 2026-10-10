import { ToolsName } from "./types";
import { SquareTerminal, FileText, FilePenLine } from "@lucide/vue";

export const TOOLS_NAME_ICON_MAPS: Record<string, Component> = {
  [ToolsName.READ]: FileText,
  [ToolsName.WRITE]: FilePenLine,
  [ToolsName.EDIT]: FilePenLine,
  [ToolsName.BASH]: SquareTerminal,
};

export const TOOLS_NAME_MAPS: Record<string, string> = {
  [ToolsName.READ]: "读取",
  [ToolsName.WRITE]: "写入",
  [ToolsName.EDIT]: "编辑",
  [ToolsName.BASH]: "执行命令",
};
