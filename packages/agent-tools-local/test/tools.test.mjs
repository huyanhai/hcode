import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyWorkspacePatch, createWorkspacePathResolver, executeWorkspaceCommand, readWorkspaceFile, searchWorkspaceFiles, WorkspaceBoundaryError, writeWorkspaceFile } from "../dist/index.js";

test("file tools support nested writes and reject symlink escapes", async () => {
  const parent = mkdtempSync(join(tmpdir(), "hcode-tools-"));
  const workspace = join(parent, "workspace");
  const outside = join(parent, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(workspace, "escape"));
  try {
    await writeWorkspaceFile({ workspaceRoot: workspace }, "nested/deep/file.txt", "hello");
    assert.equal((await readWorkspaceFile({ workspaceRoot: workspace }, "nested/deep/file.txt")).content, "hello");
    await writeWorkspaceFile({ workspaceRoot: workspace }, "patched.txt", "first\nsecond\nthird\n");
    await applyWorkspacePatch({ workspaceRoot: workspace }, "patched.txt", "@@ -1,3 +1,3 @@\n first\n-second\n+changed\n third");
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
