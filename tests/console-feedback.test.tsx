import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsoleFeedback } from "../src/components/console-feedback";

const render = (pending = "", error = "", notice = "") => renderToStaticMarkup(
  <ConsoleFeedback pending={pending} error={error} notice={notice} dismiss={() => {}} />,
);

test("Console shows progress instead of stale results and cannot dismiss it", () => {
  const html = render("กำลังบันทึก…", "old error", "old success");
  assert.match(html, /data-state="pending"/);
  assert.match(html, /role="status"/);
  assert.match(html, /กำลังบันทึก…/);
  assert.doesNotMatch(html, /old error|old success|<button/);
});

test("Console announces failures as alerts and successes as status, with dismissal", () => {
  const error = render("", "บริการข้อมูลไม่พร้อม", "old success");
  assert.match(error, /role="alert"/);
  assert.match(error, /ดำเนินการไม่สำเร็จ/);
  assert.match(error, /บริการข้อมูลไม่พร้อม/);
  assert.doesNotMatch(error, /old success/);
  const success = render("", "", "บันทึกฉบับร่างแล้ว");
  assert.match(success, /data-state="success"/);
  assert.match(success, /role="status"/);
  assert.match(success, /บันทึกฉบับร่างแล้ว/);
  for (const html of [error, success]) assert.match(html, /aria-label="ปิดข้อความแจ้งเตือน"/);
  assert.equal(render(), "");
});
