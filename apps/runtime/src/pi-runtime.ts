import { resolve } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type ConversationId,
  type Harness as HarnessType,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import {
  ApprovalDoc,
  MessageDoc,
  PermissionDoc,
  SessionDoc,
  SessionIndexDoc,
  asId,
  parseId,
} from "./documents.js";
import { ProfileModels } from "./models.js";
import { createPolicy } from "./policy.js";
import { projectConversation } from "./projection.js";
import { observeSubmission } from "./events.js";
import type {
  PiAttachment,
  PiComment,
  PiDetail,
  PiPersistence,
  PiProfile,
  PiSession,
} from "./types.js";
import type { PiStreamEvent } from "./stream-protocol.js";

const ctx = BACKGROUND_CONTEXT;

/** Owns both Pi Harness lifetimes and translates HTTP-level session operations. */
export class PiRuntime {
  private readonly profiles = new ProfileModels();
  private readonly registry = createRegistry();
  private durable!: HarnessType;
  private memory!: HarnessType;

  private constructor() {
    this.registry.install(CodingTools);
    this.registry.install(createPolicy((kind) => this.forKind(kind)));
  }

  static async open(path: string, profiles: PiProfile[]): Promise<PiRuntime> {
    const runtime = new PiRuntime();
    for (const profile of profiles) runtime.registerProfile(profile);
    const options = {
      models: runtime.profiles.models,
      registry: runtime.registry,
      env: async (target: {
        conversationId: ConversationId;
        read: { snapshot: HarnessType["snapshot"] };
      }) => {
        const session = await target.read.snapshot(
          SessionDoc,
          target.conversationId,
          ctx,
        );
        return session
          ? new NodeExecutionEnv({ cwd: session.workspacePath })
          : undefined;
      },
    };
    runtime.durable = await Harness.open(
      await openNodeSqliteStorage(path),
      options,
      ctx,
    );
    runtime.memory = await Harness.open(new MemoryStorage(), options, ctx);
    runtime.durable.resume();
    return runtime;
  }

  async close(): Promise<void> {
    await Promise.all([this.durable.close(ctx), this.memory.close(ctx)]);
  }
  registerProfile(profile: PiProfile): void {
    this.profiles.register(profile);
  }
  private forKind(kind: PiPersistence): HarnessType {
    return kind === "durable" ? this.durable : this.memory;
  }

  private async get(value: string) {
    const { kind, id } = parseId(value);
    const harness = this.forKind(kind);
    const conversation = await harness.conversation(id, ctx);
    if (!conversation || !(await harness.snapshot(SessionDoc, id, ctx)))
      throw new Error("会话不存在");
    return { kind, id, harness, conversation };
  }

  // Session metadata and its index are committed within Pi's creation transaction.
  async create(input: {
    workspaceId?: string;
    workspacePath: string;
    folders: string[];
    title?: string;
    persistence?: PiPersistence;
  }): Promise<PiSession> {
    const kind = input.persistence ?? "durable";
    const now = Date.now();
    const conversation = await this.forKind(kind).createConversation(
      {
        ownership: { kind: "ownerless" },
        init: async (tx, id) => {
          Object.assign(await tx.doc(SessionDoc, id), {
            title: input.title?.trim() || "新会话",
            workspaceId: input.workspaceId ?? null,
            workspacePath: resolve(input.workspacePath),
            folders: (input.folders.length
              ? input.folders
              : [input.workspacePath]
            ).map((folder) => resolve(folder)),
            status: "active",
            persistence: kind,
            createdAt: now,
            updatedAt: now,
            fullAccess: false,
          });
          (await tx.doc(SessionIndexDoc)).ids.push(id);
        },
      },
      ctx,
    );
    return this.summary(kind, conversation.id);
  }

  private async summary(
    kind: PiPersistence,
    id: ConversationId,
  ): Promise<PiSession> {
    const data = await this.forKind(kind).snapshot(SessionDoc, id, ctx);
    if (!data) throw new Error("会话不存在");
    return {
      id: asId(kind, id),
      workspaceId: data.workspaceId,
      title: data.title,
      status: data.status,
      persistence: kind,
      createdAt: String(data.createdAt),
      updatedAt: String(data.updatedAt),
    };
  }

  async list(workspaceId?: string): Promise<PiSession[]> {
    const result: PiSession[] = [];
    for (const kind of ["durable", "memory"] as const) {
      const harness = this.forKind(kind);
      const index = await harness.snapshot(SessionIndexDoc, ctx);
      for (const numericId of index?.ids ?? []) {
        const id = numericId as ConversationId;
        const data = await harness.snapshot(SessionDoc, id, ctx);
        if (
          data?.status === "active" &&
          (!workspaceId || data.workspaceId === workspaceId)
        )
          result.push(await this.summary(kind, id));
      }
    }
    return result.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  }

  async archive(value: string): Promise<PiSession> {
    const { kind, id, harness } = await this.get(value);
    await harness.commit(async (tx) => {
      const data = await tx.doc(SessionDoc, id);
      data.status = "archived";
      data.updatedAt = Date.now();
    }, ctx);
    return this.summary(kind, id);
  }

  /** Workspace removal must not leave active Pi sessions referring to a removed workspace. */
  async archiveWorkspace(workspaceId: string): Promise<void> {
    for (const session of await this.list(workspaceId))
      await this.archive(session.id);
  }

  /** Pi history is immutable: edit by omitting the last user turn and its descendants from model context. */
  async editLastUser(value: string, messageId: string): Promise<void> {
    const { id, harness, conversation } = await this.get(value);
    const detail = await this.detail(value);
    const lastUser = detail.messages
      .filter((message) => message.role === "user")
      .at(-1);
    if (!lastUser || lastUser.id !== messageId)
      throw new Error("只能编辑最后一条用户消息");
    await conversation.abort(ctx);
    const hidden: number[] = [];
    let cursor: Parameters<typeof conversation.entries>[2];
    do {
      const page = await conversation.entries({ order: "ascending" }, 100, cursor, ctx);
      for (const entry of page.items) if (entry.id >= Number(lastUser.id)) hidden.push(entry.id);
      cursor = page.next;
    } while (cursor);
    await conversation.submit(
      {
        type: "write",
        entry: {
          kind: "hcode.edit",
          data: { hidden },
          edits: hidden.map((target) => ({
            target: target as import("@earendil-works/pi-durable").EntryId,
            action: "omit" as const,
          })),
        },
      },
      ctx,
    );
    await harness.commit(async (tx) => {
      const state = await tx.doc(ApprovalDoc, id);
      for (const item of Object.values(state.byTask))
        if (item.status === "pending") item.status = "denied";
    }, ctx);
  }

  // The prompt is Pi-native; only UI-specific attachment/comment metadata uses hcode documents.
  async submit(
    value: string,
    input: {
      content: string;
      attachments?: PiAttachment[];
      comments?: PiComment[];
      profile: PiProfile;
      model?: string;
      whenBusy?: "followUp" | "steer";
      requestId?: string;
      fullAccess?: boolean;
    },
  ): Promise<SubmissionId> {
    const { id, harness, conversation } = await this.get(value);
    // A queued full-access request must not escalate the currently running tool task.
    if (input.fullAccess && (await this.activeSubmission(value)))
      throw new Error("会话忙碌时不能切换完全访问模式");
    const profile = {
      ...input.profile,
      model: input.model?.trim() || input.profile.model,
    };
    this.registerProfile(profile);
    await conversation.configure(
      { model: { provider: `hcode-${profile.id}`, modelId: profile.model } },
      ctx,
    );
    const attachments = input.attachments ?? [];
    const comments = input.comments ?? [];
    const notes = comments
      .map(
        (item) => `选中文本：${item.selectedText ?? ""}\n评论：${item.content}`,
      )
      .join("\n\n");
    const files = attachments
      .filter((item) => !item.mimeType.startsWith("image/"))
      .map((item) => `[附件 ${item.name} (${item.mimeType}): ${item.url}]`)
      .join("\n");
    const prompt = [
      input.content,
      notes ? `用户针对内容的评论：\n${notes}` : "",
      files,
    ]
      .filter(Boolean)
      .join("\n\n");
    const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
    for (const attachment of attachments.filter((item) =>
      item.mimeType.startsWith("image/"),
    )) {
      if (attachment.size > 25 * 1024 * 1024) throw new Error(`附件过大: ${attachment.name}`);
      const response = await fetch(attachment.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`无法读取附件: ${attachment.name}`);
      if (Number(response.headers.get("content-length") ?? 0) > 25 * 1024 * 1024)
        throw new Error(`附件过大: ${attachment.name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) throw new Error(`附件过大: ${attachment.name}`);
      images.push({
        type: "image",
        data: bytes.toString("base64"),
        mimeType: attachment.mimeType,
      });
    }
    await harness.commit(async (tx) => {
      (await tx.doc(SessionDoc, id)).fullAccess = input.fullAccess === true;
    }, ctx);
    const submission = await conversation.submit(
      {
        type: "input",
        content: images.length
          ? [{ type: "text", text: prompt }, ...images]
          : prompt,
        requestId: input.requestId,
        whenBusy: input.whenBusy ?? "followUp",
      },
      ctx,
    );
    await harness.commit(async (tx) => {
      (await tx.doc(MessageDoc, id)).bySubmission[String(submission.id)] = {
        content: input.content,
        attachments,
        comments,
      };
      (await tx.doc(PermissionDoc, id)).bySubmission[String(submission.id)] =
        input.fullAccess === true;
      const state = await tx.doc(SessionDoc, id);
      if (state.title === "新会话")
        state.title =
          input.content.split(/\r?\n/, 1)[0]?.slice(0, 30) || "新会话";
      state.updatedAt = Date.now();
    }, ctx);
    return submission.id;
  }

  // Decisions persist in Pi and are reread by the original ToolTask after restart.
  async approval(
    value: string,
  ): Promise<
    | {
        approvalId: string;
        toolCallId: string;
        toolName: string;
        input: unknown;
      }
    | undefined
  > {
    const { id, harness } = await this.get(value);
    const state = await harness.snapshot(ApprovalDoc, id, ctx);
    const pending = Object.values(state?.byTask ?? {}).find(
      (item) => item.status === "pending",
    );
    return pending
      ? {
          approvalId: pending.callId,
          toolCallId: pending.callId,
          toolName: pending.toolName,
          input: JSON.parse(pending.input),
        }
      : undefined;
  }

  async decide(
    value: string,
    approvalId: string,
    approved: boolean,
  ): Promise<void> {
    const { id, harness } = await this.get(value);
    let found = false;
    await harness.commit(async (tx) => {
      const state = await tx.doc(ApprovalDoc, id);
      const item = Object.values(state.byTask).find(
        (entry) => entry.callId === approvalId && entry.status === "pending",
      );
      if (item) {
        item.status = approved ? "approved" : "denied";
        found = true;
      }
    }, ctx);
    if (!found) throw new Error("审批请求不存在或已处理");
  }

  async activeSubmission(value: string): Promise<SubmissionId | undefined> {
    const { conversation } = await this.get(value);
    const state = await conversation.viewState(ctx);
    try {
      return (
        state.value.docs["pi.live"] as
          { run?: { inputs: SubmissionId[] } } | undefined
      )?.run?.inputs[0];
    } finally {
      state.dispose();
    }
  }

  async detail(value: string): Promise<PiDetail> {
    const { kind, id, harness, conversation } = await this.get(value);
    return projectConversation(
      value,
      await this.summary(kind, id),
      harness,
      conversation,
    );
  }

  async observe(
    value: string,
    submissionId: SubmissionId,
    emit: (event: PiStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<{ text: string; awaitingApproval: boolean }> {
    const { id, harness } = await this.get(value);
    return observeSubmission(
      harness,
      id,
      submissionId,
      emit,
      () => this.approval(value),
      async () =>
        (await this.detail(value)).messages
          .filter((item) => item.role === "assistant")
          .at(-1)?.content ?? "",
      signal,
    );
  }
}
