import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("MCP collection tools retain permissions, pagination and stored posts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gameslash-mcp-collections-"));
  process.env.GAMESLASH_DATA_DIR = directory;
  for (const key of ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL", "GAMESLASH_STORAGE", "GAMESLASH_READ_ONLY"]) delete process.env[key];
  const { updateDatabase, readDatabase } = await import("../src/lib/store");
  const { manageCatalog } = await import("../src/lib/catalog-service");
  const { POST } = await import("../src/app/api/mcp/route");
  const jobId = crypto.randomUUID();
  let writer = "", reader = "";
  const posts = Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/posts/${i}`, text: `Original post ${i}`, author: "Creator", time: "2026-10-09" }));
  let rpcId = 0;
  async function rpc(token: string, method: string, params: unknown = {}) {
    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }));
    assert.equal(response.status, 200);
    const body = await response.text();
    const message = JSON.parse(body.startsWith("{") ? body : body.split("\n").find(line => line.startsWith("data: "))!.slice(6));
    return message;
  }
  const call = (token: string, name: string, args: unknown = {}) => rpc(token, "tools/call", { name, arguments: args });
  try {
    await updateDatabase(db => {
      writer = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Writer", canWriteDrafts: true }, "Test")!;
      reader = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Reader", canWriteDrafts: false }, "Test")!;
      db.collectionJobs.push({ id: jobId, source: { id: crypto.randomUUID(), name: "Fixture", url: "https://www.facebook.com/groups/123" }, createdAt: new Date().toISOString(), limit: 100, status: "SUCCEEDED", runId: "fixtureRun", message: "", candidates: posts });
    });
    const before = await readDatabase();
    const tools = (await rpc(writer, "tools/list")).result.tools;
    for (const name of ["list_collections", "get_collection_posts"]) {
      assert.ok(tools.some((tool: { name: string }) => tool.name === name));
      assert.equal((await call(reader, name, name === "get_collection_posts" ? { jobId } : {})).result.isError, true);
    }
    assert.deepEqual((await call(writer, "list_collections")).result.structuredContent.jobs, [{ id: jobId, source: "Fixture", status: "SUCCEEDED", count: 11, runId: "fixtureRun" }]);
    const first = (await call(writer, "get_collection_posts", { jobId })).result.structuredContent;
    assert.deepEqual(first, { posts: posts.slice(0, 5), total: 11, nextOffset: 5, runId: "fixtureRun" });
    assert.deepEqual((await call(writer, "get_collection_posts", { jobId, offset: 5, limit: 10 })).result.structuredContent, { posts: posts.slice(5), total: 11, nextOffset: null, runId: "fixtureRun" });
    assert.deepEqual((await call(writer, "get_collection_posts", { jobId, offset: 11 })).result.structuredContent.posts, []);
    assert.equal((await call(writer, "get_collection_posts", { jobId: crypto.randomUUID() })).result.isError, true);
    assert.equal((await call(writer, "get_collection_posts", { jobId, limit: 11 })).result.isError, true);
    assert.deepEqual(await readDatabase(), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
