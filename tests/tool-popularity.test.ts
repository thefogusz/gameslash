import test from "node:test";
import assert from "node:assert/strict";
import { entryInput, toolPopularitySchema } from "../src/lib/model";
import { seedDatabase } from "../src/lib/seed";
import { manageCatalog } from "../src/lib/catalog-service";
import { authenticateAgent, createAgentDraft, editAgentDraft } from "../src/lib/catalog-service";
const popularity = { score: 4, reason: "มีชุมชนผู้พัฒนาและผลงานที่ตรวจสอบได้จากเว็บไซต์ทางการ", sources: ["https://godotengine.org/showcase/"], checkedAt: "2026-10-09" };
test("MCP tool drafts retain evidence and clear it when changing content type", () => {
  const db=seedDatabase();
  const token=manageCatalog(db,{action:'create_agent',revision:db.revision,name:'Popularity test',canWriteDrafts:true})!;
  const agent=authenticateAgent(db,token)!;
  const input=entryInput.parse({...db.entries.find(e=>e.id==='godot'),title:'Test tool',url:'https://example.com/popularity-test',popularity});
  const draft=createAgentDraft(db,agent.id,'popularity-test',input);
  assert.deepEqual(draft.popularity,popularity);
  const {popularity: ignored,...article}=input;
  const updated=editAgentDraft(db,agent.id,draft.id,draft.updatedAt,{...article,kind:'article'});
  assert.equal(updated.popularity,undefined);
});
test("tool popularity requires bounded integer stars, evidence and a real date", () => {
  assert.equal(toolPopularitySchema.safeParse(popularity).success, true);
  for (const patch of [{score:0},{score:6},{score:3.5},{sources:[]},{sources:["javascript:alert(1)"]},{sources:["https://127.0.0.1"]},{reason:"test"},{checkedAt:"2026-02-30"}]) {
    assert.equal(toolPopularitySchema.safeParse({...popularity,...patch}).success,false,JSON.stringify(patch));
  }
  const game=seedDatabase().entries.find(e=>e.kind==='game')!;
  assert.equal(entryInput.safeParse({...game,popularity}).success,false);
});
test("old clients preserve tool scores, explicit null clears, legacy records still parse", () => {
  const db=seedDatabase();const tool=db.entries.find(e=>e.id==='godot')!;
  assert.equal(entryInput.safeParse(tool).success,true);
  manageCatalog(db,{action:'entry',revision:db.revision,entry:{...tool,popularity}});
  manageCatalog(db,{action:'entry',revision:db.revision,entry:{...tool,description:'ปรับคำอธิบายโดยไคลเอนต์เก่าที่ไม่มีข้อมูลดาว'}});
  assert.deepEqual(db.entries.find(e=>e.id===tool.id)!.popularity,popularity);
  manageCatalog(db,{action:'entry',revision:db.revision,entry:{...tool,popularity:null}});
  assert.equal(db.entries.find(e=>e.id===tool.id)!.popularity,null);
});
