import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editorialScope, editorialHandbook, editorialSkills } from "../src/lib/editorial-skills";

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

test("AI-assisted development qualifies without requiring AI gameplay or named tools", () => {
  assert.ok(editorialHandbook().includes(editorialScope));
  assert.match(editorialScope, /ไม่ต้องรู้ชื่อเครื่องมือ ไม่ต้องมี AI ใน gameplay/);
  assert.match(editorialScope, /ห้ามเติมข้อความปฏิเสธ/);
  const verification = editorialSkills.find(s => s.id === "source-verification")!;
  assert.ok(verification.instructions.some(s => s.includes("เพียงพอสำหรับเข้าคลัง") && s.includes("สร้างด้วย AI")));
  const writing = editorialSkills.find(s => s.id === "thai-editorial")!;
  assert.ok(writing.instructions.some(s => s.includes("ไม่เติมย่อหน้าว่าไม่พบเครื่องมือ AI")));
  const route = readFileSync(new URL("../src/app/api/mcp/route.ts", import.meta.url), "utf8");
  assert.match(route, /return \{\s+editorialScope,/);
});
