import { createInterface } from "node:readline";
import { commandSchema, type Command } from "@hcode/agent-protocol";
import { AgentRuntime } from "./runtime.js";

// stdout 是 JSONL 协议的唯一传输通道。第三方 SDK 的提示和普通日志全部转发到 stderr，
// 否则任意一行非 JSON 输出都会让 Electron Bridge 丢失协议同步。
const logToStderr = console.error.bind(console);
console.log = logToStderr;
console.info = logToStderr;
console.warn = logToStderr;

const runtime = new AgentRuntime(
  (event) => process.stdout.write(`${JSON.stringify({ type: "event", event })}\n`),
  { databasePath: process.env.HCODE_DB_PATH },
);
process.stdout.write(`${JSON.stringify({ type: "event", event: { type: "runtime/ready", createdAt: Date.now() } })}\n`);

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let processing = Promise.resolve();
input.on("line", (line) => {
  processing = processing.then(() => handleLine(line));
});
input.on("close", () => { void processing.finally(() => runtime.close()); });

async function handleLine(line: string): Promise<void> {
  let requestId = "unknown";
  try {
    const input = JSON.parse(line) as unknown;
    if (input && typeof input === "object" && "requestId" in input && typeof input.requestId === "string") {
      requestId = input.requestId;
    }
    const command = commandSchema.parse(input) as Command;
    const response = await runtime.handle(command);
    process.stdout.write(`${JSON.stringify({ type: "response", response })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ type: "response", response: { requestId, ok: false, error: { code: "INVALID_COMMAND", message: error instanceof Error ? error.message : String(error) } } })}\n`);
  }
}
