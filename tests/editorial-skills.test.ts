import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editorialHandbook, editorialSkills } from "../src/lib/editorial-skills";

test("editorial skills are discoverable and reference real MCP tools", () => {
  const route = readFileSync(new URL("../src/app/api/mcp/route.ts", import.meta.url), "utf8");
  const registered = [...route.matchAll(/registerTool\("([^"]+)"/g)].map(m => m[1]);
  assert.ok(registered.includes("get_editorial_skills"));
  assert.equal(new Set(editorialSkills.map(s => s.id)).size, editorialSkills.length);
  for (const skill of editorialSkills) {
    assert.ok(skill.instructions.length >= 4);
    assert.ok(editorialHandbook().includes(skill.id));
    for (const tool of skill.tools) assert.ok(registered.includes(tool), `Missing MCP tool ${tool}`);
  }
  assert.match(editorialHandbook(), /CCU/);
  assert.match(editorialHandbook(), /ไม่ปลอมเสียง/);
  assert.match(editorialHandbook(), /สิทธิ์/);
});
