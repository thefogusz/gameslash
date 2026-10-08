import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3020";
const password = process.env.ADMIN_PASSWORD;
assert.ok(password, "Load .env.local first");
const json = { "Content-Type": "application/json", Origin: origin };
assert.equal((await fetch(`${origin}/api/manage`)).status, 401);
const foreign = await fetch(`${origin}/api/session`, {
  method: "POST",
  headers: { ...json, Origin: "https://untrusted.test" },
  body: JSON.stringify({ password }),
});
assert.equal(foreign.status, 400);
const login = await fetch(`${origin}/api/session`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ password }),
});
assert.equal(login.status, 200);
const fullCookie = login.headers.get("set-cookie")!;
assert.match(fullCookie, /HttpOnly/i);
assert.match(fullCookie, /SameSite=strict/i);
const headers = { ...json, Cookie: fullCookie.split(";")[0] };
const before = await (await fetch(`${origin}/api/manage`, { headers })).json();
const url = `https://example.com/gameslash-smoke-${crypto.randomUUID()}`;
const entry = {
  kind: "game",
  title: "Local smoke test",
  description: "Temporary test entry for moderation verification.",
  author: "Automated local test",
  category: "ปริศนา",
  url,
  sourceUrl: "",
  image: "",
  body: "",
  tags: [],
  status: "published",
};
const submitted = await fetch(`${origin}/api/submit`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ entry }),
});
assert.equal(submitted.status, 201);
const { id } = await submitted.json();
let snapshot = await (await fetch(`${origin}/api/manage`, { headers })).json();
const pending = snapshot.entries.find((e: { id: string }) => e.id === id);
assert.equal(pending.status, "pending");
assert.equal((await fetch(`${origin}/item/${id}`)).status, 404);
const duplicate = await fetch(`${origin}/api/submit`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ entry }),
});
assert.equal(duplicate.status, 400);
const stale = await fetch(`${origin}/api/manage`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    action: "layout",
    revision: before.revision,
    layout: before.layout,
    publish: true,
  }),
});
assert.equal(stale.status, 409);
const archived = await fetch(`${origin}/api/manage`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    action: "entry",
    revision: snapshot.revision,
    entry: { ...pending, status: "archived" },
  }),
});
assert.equal(archived.status, 200);
snapshot = await archived.json();
const draft = { ...snapshot.layout, tagline: "UNPUBLISHED SMOKE TEST" };
const saved = await fetch(`${origin}/api/manage`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    action: "layout",
    revision: snapshot.revision,
    layout: draft,
    publish: false,
  }),
});
assert.equal(saved.status, 200);
snapshot = await saved.json();
assert.equal(
  (await (await fetch(origin)).text()).includes("UNPUBLISHED SMOKE TEST"),
  false,
);
const restore = await fetch(`${origin}/api/manage`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    action: "layout",
    revision: snapshot.revision,
    layout: before.draftLayout,
    publish: false,
  }),
});
assert.equal(restore.status, 200);
assert.equal(
  (await fetch(`${origin}/api/session`, { method: "DELETE", headers })).status,
  200,
);
console.log(
  "PASS: login, cookie flags, anonymous access, CSRF, submission moderation, deduplication, stale writes and draft isolation. Test entry archived.",
);
