import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyAdditionalWorkspacePatch, applyWorkspacePatch, createWorkspacePathResolver, executeAdditionalWorkspaceCommand, executeWorkspaceCommand, listAdditionalFiles, readAdditionalWorkspaceFile, readWorkspaceFile, searchAdditionalWorkspaceFiles, searchWorkspaceFiles, WorkspaceBoundaryError, writeAdditionalWorkspaceFile, writeWorkspaceFile } from "../dist/index.js";

test("file tools support nested writes and reject symlink escapes", async () => {
  const parent = mkdtempSync(join(tmpdir(), "hcode-tools-"));
  const workspace = join(parent, "workspace");
  const outside = join(parent, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(workspace, "escape"));
  try {
    const newFile = await writeWorkspaceFile({ workspaceRoot: workspace }, "nested/deep/file.txt", "hello");
    assert.equal(newFile.originalContent, "");
    assert.equal(newFile.content, "hello");
    assert.equal((await readWorkspaceFile({ workspaceRoot: workspace }, "nested/deep/file.txt")).content, "hello");
    await writeWorkspaceFile({ workspaceRoot: workspace }, "patched.txt", "first\nsecond\nthird\n");
    const rewrittenFile = await writeWorkspaceFile({ workspaceRoot: workspace }, "patched.txt", "first\nrewritten\nthird\n");
    assert.equal(rewrittenFile.originalContent, "first\nsecond\nthird\n");
    assert.equal(rewrittenFile.content, "first\nrewritten\nthird\n");
    const patchedFile = await applyWorkspacePatch({ workspaceRoot: workspace }, "patched.txt", "@@ -1,3 +1,3 @@\n first\n-rewritten\n+changed\n third");
    assert.equal(patchedFile.originalContent, "first\nrewritten\nthird\n");
    assert.equal(patchedFile.content, "first\nchanged\nthird\n");
    assert.equal((await readWorkspaceFile({ workspaceRoot: workspace }, "patched.txt")).content, "first\nchanged\nthird\n");
    await assert.rejects(
      applyWorkspacePatch({ workspaceRoot: workspace }, "patched.txt", "@@ -1,1 +1,1 @@\n-stale\n+wrong"),
      /context mismatch/,
    );
    assert.throws(() => createWorkspacePathResolver(workspace)("escape/secret.txt", { mustExist: true }), WorkspaceBoundaryError);
    assert.deepEqual(await searchWorkspaceFiles({ workspaceRoot: workspace }, "secret"), []);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("command execution is scoped to the workspace", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "hcode-command-"));
  try {
    const result = await executeWorkspaceCommand({ workspaceRoot: workspace }, "pwd");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), realpathSync(workspace));
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("additional folder tools are explicit and keep folder labels", async () => {
  const parent = mkdtempSync(join(tmpdir(), "hcode-additional-"));
  const primary = join(parent, "primary");
  const books = join(parent, "books");
  mkdirSync(primary);
  mkdirSync(books);
  writeFileSync(join(primary, "primary.txt"), "primary");
  writeFileSync(join(books, "chapter.txt"), "chapter");
  try {
    const context = { additionalRoots: [{ name: "books", path: books }] };
    assert.deepEqual(await listAdditionalFiles(context, "books"), ["books/chapter.txt"]);
    assert.deepEqual(await readAdditionalWorkspaceFile(context, "books", "chapter.txt"), {
      path: "books/chapter.txt",
      content: "chapter",
    });
    assert.deepEqual(await searchAdditionalWorkspaceFiles(context, "books", "chapter"), [
      { path: "books/chapter.txt", line: 1, text: "chapter" },
    ]);
    const command = await executeAdditionalWorkspaceCommand(context, "books", "pwd");
    assert.equal(command.stdout.trim(), realpathSync(books));
    await writeAdditionalWorkspaceFile(context, "books", "edited.txt", "edited");
    assert.equal((await readAdditionalWorkspaceFile(context, "books", "edited.txt")).content, "edited");
    await applyAdditionalWorkspacePatch(context, "books", "edited.txt", "@@ -1,1 +1,1 @@\n-edited\n+updated");
    assert.equal((await readAdditionalWorkspaceFile(context, "books", "edited.txt")).content, "updated");
    await assert.rejects(readAdditionalWorkspaceFile(context, "missing", "chapter.txt"), /not configured/);
    await assert.rejects(readAdditionalWorkspaceFile(context, "books", "../primary/primary.txt"), /outside workspace/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
