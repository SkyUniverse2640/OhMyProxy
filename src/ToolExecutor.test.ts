import { test, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { ToolExecutor } from "./ToolExecutor";

const TMP = join(import.meta.dir, "..", ".test-tmp");

// Setup: create temp directory
mkdirSync(join(TMP, "subdir"), { recursive: true });
writeFileSync(join(TMP, "hello.txt"), "Hello, world!\nLine two\n");
writeFileSync(join(TMP, "config.json"), '{"key": "value"}');
writeFileSync(join(TMP, "subdir", "nested.ts"), 'const x = 42;\n');

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function exec(cwd: string) {
  return new ToolExecutor(cwd);
}

// ─── Bash ────────────────────────────────────────────────────────────────

test("bash: echo", async () => {
  const result = await exec(TMP).execute("bash", { command: "echo hello" });
  expect(result.stdout).toContain("hello");
  expect(result.exitCode).toBe(0);
  expect(result.status).toBe("SUCCESS");
});

test("bash: failing command", async () => {
  const result = await exec(TMP).execute("bash", { command: "exit 1" });
  expect(result.exitCode).toBe(1);
  expect(result.status).toBe("ERROR");
});

test("bash: no command", async () => {
  const result = await exec(TMP).execute("bash", {});
  expect(result.error).toContain("No command");
});

// ─── ReadFile ─────────────────────────────────────────────────────────────

test("readFile: existing file", async () => {
  const result = await exec(TMP).execute("readFile", { path: "hello.txt" });
  expect(result.content).toBe("Hello, world!\nLine two\n");
});

test("readFile: nonexistent", async () => {
  const result = await exec(TMP).execute("readFile", { path: "nope.txt" });
  expect(result.error).toContain("File not found");
});

test("readFile: read alias", async () => {
  const result = await exec(TMP).execute("read", { path: "hello.txt" });
  expect(result.content).toContain("Hello");
});

// ─── WriteFile ────────────────────────────────────────────────────────────

test("writeFile: create new file", async () => {
  const result = await exec(TMP).execute("writeFile", {
    path: "new.txt",
    content: "brand new content",
  });
  expect(result.status).toBe("SUCCESS");
  expect(result.filePath).toBe("new.txt");
});

test("writeFile: write alias", async () => {
  await exec(TMP).execute("write", { path: "write-test.txt", content: "test" });
  const read = await exec(TMP).execute("readFile", { path: "write-test.txt" });
  expect(read.content).toBe("test");
});

// ─── Edit ─────────────────────────────────────────────────────────────────

test("edit: single replacement", async () => {
  writeFileSync(join(TMP, "edit.txt"), "Hello, world!");
  const result = await exec(TMP).execute("edit", {
    path: "edit.txt",
    oldString: "world",
    newString: "bun",
  });
  expect(result.status).toBe("SUCCESS");
  const read = await exec(TMP).execute("readFile", { path: "edit.txt" });
  expect(read.content).toBe("Hello, bun!");
});

test("edit: old_string not found", async () => {
  writeFileSync(join(TMP, "edit2.txt"), "abc");
  const result = await exec(TMP).execute("edit", {
    path: "edit2.txt",
    oldString: "xyz",
    newString: "123",
  });
  expect(result.status).toBe("ERROR");
  expect(result.error).toContain("not found");
});

test("edit: multiple matches without replace_all", async () => {
  writeFileSync(join(TMP, "edit3.txt"), "aaaa");
  const result = await exec(TMP).execute("edit", {
    path: "edit3.txt",
    oldString: "aa",
    newString: "bb",
  });
  expect(result.status).toBe("ERROR");
  expect(result.error).toContain("replace_all");
});

test("edit: replace_all", async () => {
  writeFileSync(join(TMP, "edit4.txt"), "aaaa");
  const result = await exec(TMP).execute("edit", {
    path: "edit4.txt",
    oldString: "aa",
    newString: "bb",
    replaceAll: true,
  });
  expect(result.status).toBe("SUCCESS");
  const read = await exec(TMP).execute("readFile", { path: "edit4.txt" });
  expect(read.content).toBe("bbbb");
});

// ─── Glob ─────────────────────────────────────────────────────────────────

test("glob: find files by pattern", async () => {
  const result = await exec(TMP).execute("glob", { pattern: ".txt" });
  expect(result.results).toContain("hello.txt");
  // All results must match the .txt pattern
  expect(result.results.every((r: string) => r.includes(".txt"))).toBe(true);
  expect(result.total).toBeGreaterThanOrEqual(2);
});

test("glob: no matches", async () => {
  const result = await exec(TMP).execute("glob", { pattern: ".xyz" });
  expect(result.results).toEqual([]);
});

// ─── Grep ─────────────────────────────────────────────────────────────────

test("grep: find pattern in files", async () => {
  const result = await exec(TMP).execute("grep", { pattern: "Hello" });
  expect(result.results.length).toBeGreaterThanOrEqual(1);
  expect(result.results[0]!.content).toContain("Hello");
});

// ─── ListDirectory ────────────────────────────────────────────────────────

test("listDirectory: list entries", async () => {
  const result = await exec(TMP).execute("listDirectory", { path: "." });
  const names = result.entries.map((e: any) => e.name);
  expect(names).toContain("hello.txt");
  expect(names).toContain("subdir");
});

// ─── DeleteFile ───────────────────────────────────────────────────────────

test("deleteFile: remove file", async () => {
  writeFileSync(join(TMP, "to-delete.txt"), "bye");
  const result = await exec(TMP).execute("deleteFile", { path: "to-delete.txt" });
  expect(result.status).toBe("SUCCESS");
});

// ─── Unknown Tool ─────────────────────────────────────────────────────────

test("unknown tool returns error", async () => {
  const result = await exec(TMP).execute("nonexistent", {});
  expect(result.error).toContain("Unknown tool");
});

// ─── Summarize ────────────────────────────────────────────────────────────

test("summarize: known tool", () => {
  const result = ToolExecutor.summarize("readFile", { path: "foo.txt" }, {});
  expect(result).toContain("foo.txt");
});

test("summarize: error result", () => {
  const result = ToolExecutor.summarize("bash", {}, { error: "something broke" });
  expect(result).toContain("something broke");
});
