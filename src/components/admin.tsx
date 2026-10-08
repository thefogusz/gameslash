"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Plus,
  X,
  Save,
  Eye,
  LogOut,
  Upload,
  Download,
  Pencil,
  LayoutTemplate,
  ListFilter,
  RefreshCw,
  LockKeyhole,
  Check,
  Search,
  GripVertical,
  Loader2,
  Inbox,
  Plug,
} from "lucide-react";
import { HomeContent } from "./directory";
import { EntryForm } from "./entry-form";
import { AgentPanel, ActivityPanel } from "./agent-panel";
import { ReviewPanel, type SubmissionInfo } from "./review-panel";
import { SpotlightEditor } from "./spotlight-editor";
import { ConnectionsPanel } from "./connections-panel";
import {
  kindLabels,
  type Database,
  type Entry,
  type Layout,
} from "@/lib/model";
type Snapshot = Pick<
  Database,
  "entries" | "layout" | "draftLayout" | "revision" | "activity" | "reviews"
> & { storageReady: boolean; agents: Omit<Database["agents"][number], "tokenHash">[]; issuedToken?: string; submissions: SubmissionInfo };
async function request(
  url: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "คำขอไม่สำเร็จ");
  return data;
}
export function Login({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <Link className="wordmark" href="/">
        game<span className="wordmark-slash">/</span>slash
      </Link>
      <div className="login-card">
        <div className="login-icon">
          <LockKeyhole size={25} />
        </div>
        <span className="eyebrow">A LITTLE SPACE, ALL YOURS</span>
        <h1>พื้นที่ผู้ดูแล</h1>
        <p>จัดการเนื้อหา และทำให้ gameslash เป็นแบบคุณ</p>
        {!configured ? (
          <div className="form-error">
            ยังไม่ได้ตั้งค่าบัญชีผู้ดูแล กรุณาตั้ง ADMIN_PASSWORD และ
            SESSION_SECRET บนเซิร์ฟเวอร์ก่อนใช้งาน
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const password = new FormData(e.currentTarget).get("password");
              try {
                await request("/api/session", { password });
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              รหัสผ่านผู้ดูแล
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                maxLength={200}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <ArrowUpRight size={16} />
              )}{" "}
              เข้าสู่ระบบ
            </button>
          </form>
        )}
        <Link href="/" className="text-link">
          <ArrowLeft size={14} />
          กลับไปหน้าเว็บ
        </Link>
      </div>
      <p className="login-foot">Simple things. Thoughtfully made.</p>
    </main>
  );
}
export function Admin() {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState<"inbox" | "entries" | "layout" | "import" | "agents" | "activity" | "connections">("inbox");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  async function reload() {
    setError("");
    try {
      setData(await request("/api/manage"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await request("/api/manage", {
        ...body,
        revision: data?.revision,
      });
      const { issuedToken: _token, ...snapshot } = next;
      setData(snapshot);
      setNotice(message);
      return next as Snapshot;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function newEntry() {
    setEditing({
      id: crypto.randomUUID(),
      kind: "game",
      title: "",
      description: "",
      author: "",
      category: "",
      url: "",
      sourceUrl: "",
      image: "",
      body: "",
      tags: [],
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  const items =
    data?.entries.filter(
      (e) =>
        (filter === "all" || filter === e.status || filter === e.kind) &&
        `${e.title} ${e.author}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  return (
    <div className="admin-app">
      <header className="admin-header">
        <Link className="wordmark" href="/">
          game<span className="wordmark-slash">/</span>slash{" "}
          <span className="admin-badge">STUDIO</span>
        </Link>
        <div>
          <Link href="/" target="_blank" className="button">
            <Eye size={15} />
            ดูหน้าเว็บ <ArrowUpRight size={13} />
          </Link>
          <button
            className="icon-button"
            aria-label="ออกจากระบบ"
            onClick={async () => {
              try {
                await request("/api/session", undefined, "DELETE");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="studio-nav">
        <button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>
          <Inbox size={16} />กล่องรอตรวจ <span>{data?.entries.filter(e => e.status === "pending").length || 0}</span>
        </button>
        <button
          className={tab === "entries" ? "active" : ""}
          onClick={() => setTab("entries")}
        >
          <ListFilter size={16} />
          คลังเนื้อหา
        </button>
        <button
          className={tab === "layout" ? "active" : ""}
          onClick={() => setTab("layout")}
        >
          <LayoutTemplate size={16} />
          จัดหน้าเว็บไซต์
        </button>
        <button
          className={tab === "import" ? "active" : ""}
          onClick={() => setTab("import")}
        >
          <Upload size={16} />
          นำเข้า JSON
        </button>
        <button className={tab === "connections" ? "active" : ""} onClick={() => setTab("connections")}>
          <Plug size={16} />แหล่งข้อมูล
        </button>
        <button className={tab === "agents" ? "active" : ""} onClick={() => setTab("agents")}>
          <LockKeyhole size={16} />เอเจนต์
        </button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>
          ประวัติล่าสุด
        </button>
        <button className="studio-refresh" onClick={reload}>
          <RefreshCw size={15} />
          โหลดข้อมูลล่าสุด
        </button>
      </div>
      <div className="studio-body">
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="success-notice" role="status">
            <Check size={15} />
            {notice}
          </div>
        )}
        {!data ? (
          <div className="empty-state">
            {error ? (
              "ยังโหลดข้อมูลไม่ได้"
            ) : (
              <>
                <Loader2 className="spin" />
                กำลังเปิดสตูดิโอ…
              </>
            )}
          </div>
        ) : (
          <>
            {!data.storageReady && (
              <div className="form-error">
                ระบบบันทึกข้อมูลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง
              </div>
            )}
            {tab === "entries" && (
              <>
                <div className="studio-heading">
                  <div>
                    <span className="eyebrow">YOUR COLLECTION</span>
                    <h1>ทุกเรื่องราว เริ่มจากตรงนี้</h1>
                    <p>ตรวจ แก้ไข และเลือกสิ่งที่จะปรากฏบน gameslash</p>
                  </div>
                  <button className="button primary" onClick={newEntry}>
                    <Plus size={16} />
                    เพิ่มรายการ
                  </button>
                </div>
                <div className="admin-summary">
                  <span>
                    <b>
                      {
                        data.entries.filter((e) => e.status === "published")
                          .length
                      }
                    </b>{" "}
                    เผยแพร่แล้ว
                  </span>
                  <span>
                    <b>
                      {
                        data.entries.filter((e) => e.status === "pending")
                          .length
                      }
                    </b>{" "}
                    รอตรวจสอบ
                  </span>
                  <span>
                    <b>
                      {data.entries.filter((e) => e.status === "draft").length}
                    </b>{" "}
                    ฉบับร่าง
                  </span>
                </div>
                <div className="admin-filter">
                  <div className="filter-chips">
                    {[
                      ["all", "ทั้งหมด"],
                      ["pending", "รอตรวจ"],
                      ["draft", "ฉบับร่าง"],
                      ["game", "เกม"],
                      ["tool", "เครื่องมือ"],
                      ["article", "บทความ"],
                      ["post", "คอมมูนิตี้"],
                      ["archived", "เก็บเข้าคลัง"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        aria-pressed={filter === v}
                        onClick={() => setFilter(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="ค้นหาเนื้อหา"
                      placeholder="ค้นหาในคลัง…"
                    />
                  </label>
                </div>
                <div className="content-table">
                  <div className="table-head">
                    <span>รายการ</span>
                    <span>ประเภท</span>
                    <span>สถานะ</span>
                    <span>จัดการ</span>
                  </div>
                  {items.length ? (
                    items.map((e) => (
                      <div className="table-row" key={e.id}>
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {e.author} · {e.category}
                          </small>
                        </div>
                        <span>{kindLabels[e.kind]}</span>
                        <span className={`status status-${e.status}`}>
                          {
                            {
                              published: "เผยแพร่แล้ว",
                              pending: "รอตรวจสอบ",
                              draft: "ฉบับร่าง",
                              archived: "เก็บเข้าคลัง",
                            }[e.status]
                          }
                        </span>
                        <button
                          className="button small-button"
                          onClick={() => setEditing(e)}
                        >
                          <Pencil size={13} />
                          แก้ไข
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">ไม่มีรายการในหมวดนี้</div>
                  )}
                </div>
              </>
            )}
            {tab === "inbox" && <ReviewPanel entries={data.entries} submissions={data.submissions} agents={data.agents} reviews={data.reviews} busy={busy} edit={setEditing} connect={() => setTab("connections")} decide={async (entry, decision, note) => {
              await mutate({ action: "review", id: entry.id, expectedUpdatedAt: entry.updatedAt, decision, note }, { publish: "เผยแพร่แล้ว รายการแสดงบนเว็บทันที", return: "ส่งกลับเป็นฉบับร่างแล้ว เอเจนต์อ่านหมายเหตุและแก้ไขต่อได้", reject: "เก็บรายการเข้าคลังแล้ว สามารถเปิดกลับมาแก้ได้" }[decision]);
            }} />}
            {tab === "connections" && <ConnectionsPanel refreshCatalog={reload} openAgents={() => setTab("agents")} openInbox={() => setTab("inbox")} entries={data.entries} categories={data.layout.categories} createDraft={async (jobId, sourceUrl, entry) => { await mutate({ action: "collection_draft", jobId, sourceUrl, entry }, "ส่งเข้ากล่องรอตรวจแล้ว"); }} />}
            {tab === "layout" && (
              <LayoutEditor
                key={data.revision}
                data={data}
                busy={busy}
                save={async (layout, publish) => {
                  await mutate(
                    { action: "layout", layout, publish },
                    publish
                      ? "เผยแพร่หน้าตาใหม่แล้ว"
                      : "บันทึกฉบับร่างแล้ว หน้าเว็บจริงยังคงเดิม",
                  );
                }}
              />
            )}
            {tab === "import" && (
              <ImportPanel
                busy={busy}
                entries={data.entries}
                onImport={async (entries) => {
                  await mutate(
                    { action: "import", entries },
                    "นำเข้าเป็นฉบับร่างแล้ว ตรวจรายการได้ในคลังเนื้อหา",
                  );
                }}
              />
            )}
            {tab === "agents" && <AgentPanel agents={data.agents} busy={busy} mutate={mutate} />}
            {tab === "activity" && <ActivityPanel activity={data.activity} />}
          </>
        )}
      </div>
      {editing && data && (
        <EditorDialog onClose={() => setEditing(null)}>
          <div className="drawer-heading">
            <div>
              <span className="eyebrow">CONTENT EDITOR</span>
              <h2>{editing.title || "เพิ่มรายการใหม่"}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="ปิดตัวแก้ไข"
              onClick={() => setEditing(null)}
            >
              <X size={20} />
            </button>
          </div>
          <EntryForm
            admin
            initial={editing}
            categories={data.layout.categories}
            onSave={async (entry, status) => {
              await mutate(
                { action: "entry", entry: { ...editing, ...entry, status } },
                status === "published"
                  ? "บันทึกและเผยแพร่รายการแล้ว"
                  : "บันทึกรายการแล้ว",
              );
              setEditing(null);
            }}
          />
        </EditorDialog>
      )}
    </div>
  );
}
function LayoutEditor({
  data,
  busy,
  save,
}: {
  data: Snapshot;
  busy: boolean;
  save: (layout: Layout, publish: boolean) => Promise<void>;
}) {
  const [layout, setLayout] = useState<Layout>(
      structuredClone(data.draftLayout),
    ),
    [selected, setSelected] = useState("featured"),
    [newCategory, setNewCategory] = useState(""),
    [error, setError] = useState("");
  const section = layout.sections.find((s) => s.id === selected);
  function changeSection(patch: Partial<Layout["sections"][number]>) {
    setLayout({
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === selected ? { ...s, ...patch } : s,
      ),
    });
  }
  function move(index: number, delta: number) {
    const sections = [...layout.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setLayout({ ...layout, sections });
  }
  const changed = JSON.stringify(layout) !== JSON.stringify(data.draftLayout);
  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  return (
    <>
      <div className="studio-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>จัดหน้าเว็บ ในแบบที่เห็น</h1>
          <p>
            คลิกกรอบในตัวอย่างเพื่อแก้ไข จัดลำดับด้วยปุ่มลูกศร
            แล้วเผยแพร่เมื่อพร้อม
          </p>
        </div>
        <div className="studio-actions">
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              try {
                await save(layout, false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Save size={15} />
            บันทึกฉบับร่าง
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              try {
                await save(layout, true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Check size={15} />
            เผยแพร่หน้าเว็บ
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="layout-workspace">
        <div className="layout-preview">
          <div className="preview-bar">
            <span className="live-dot" />
            ตัวอย่างฉบับร่าง <span>หน้าแรก</span>
          </div>
          <div className="preview-content">
            <HomeContent
              catalog={{
                entries: data.entries.filter((e) => e.status === "published"),
                layout,
              }}
              editSection={setSelected}
            />
          </div>
        </div>
        <aside className="layout-inspector">
          <h2>
            <LayoutTemplate size={17} />
            องค์ประกอบหน้าเว็บ
          </h2>
          <button
            className={`inspector-item ${selected === "featured" ? "selected" : ""}`}
            onClick={() => setSelected("featured")}
          >
            <LayoutTemplate size={15} />
            เกมแนะนำ
          </button>
          {layout.sections.map((s, i) => (
            <div
              className={`section-order ${selected === s.id ? "selected" : ""}`}
              key={s.id}
            >
              <button className="order-title" onClick={() => setSelected(s.id)}>
                <GripVertical size={14} />
                {s.title}
                {!s.enabled && <span>ซ่อน</span>}
              </button>
              <button
                aria-label={`ย้าย ${s.title} ขึ้น`}
                className="order-arrow"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                aria-label={`ย้าย ${s.title} ลง`}
                className="order-arrow"
                disabled={i === layout.sections.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={13} />
              </button>
            </div>
          ))}
          <button
            className="add-section"
            onClick={() => {
              const id = crypto.randomUUID();
              setLayout({
                ...layout,
                sections: [
                  ...layout.sections,
                  {
                    id,
                    title: "ส่วนใหม่",
                    kind: "game",
                    template: "shelf",
                    category: "",
                    enabled: true,
                  },
                ],
              });
              setSelected(id);
            }}
          >
            <Plus size={14} />
            เพิ่มส่วนแสดงผล
          </button>
          <div className="inspector-fields">
            {selected === "featured" ? (
              <SpotlightEditor layout={layout} entries={data.entries} onChange={setLayout} />
            ) : (
              section && (
                <>
                  <h3>แก้ไขส่วนแสดงผล</h3>
                  <label>
                    ชื่อหัวข้อ
                    <input
                      value={section.title}
                      maxLength={80}
                      onChange={(e) => changeSection({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    เนื้อหา
                    <select
                      value={section.kind}
                      onChange={(e) =>
                        changeSection({
                          kind: e.target.value as Entry["kind"],
                          category: "",
                        })
                      }
                    >
                      {Object.entries(kindLabels).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    เทมเพลต
                    <select
                      value={section.template}
                      onChange={(e) =>
                        changeSection({
                          template: e.target.value as "shelf" | "grid" | "list",
                        })
                      }
                    >
                      <option value="shelf">แถวเลื่อนแนวนอน</option>
                      <option value="grid">กริด</option>
                      <option value="list">รายการแนวตั้ง</option>
                    </select>
                  </label>
                  <label>
                    กรองหมวดหมู่
                    <select
                      value={section.category}
                      onChange={(e) =>
                        changeSection({ category: e.target.value })
                      }
                    >
                      <option value="">ทุกหมวด</option>
                      {[
                        ...new Set(
                          data.entries
                            .filter((e) => e.kind === section.kind)
                            .map((e) => e.category),
                        ),
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={(e) =>
                        changeSection({ enabled: e.target.checked })
                      }
                    />
                    แสดงส่วนนี้บนหน้าเว็บ
                  </label>
                  <button
                    className="text-danger"
                    onClick={() => {
                      setLayout({
                        ...layout,
                        sections: layout.sections.filter(
                          (s) => s.id !== section.id,
                        ),
                      });
                      setSelected("featured");
                    }}
                  >
                    นำส่วนนี้ออกจากฉบับร่าง
                  </button>
                </>
              )
            )}
          </div>
          <div className="inspector-fields">
            <h3>ข้อความท้ายเว็บ</h3>
            <label>
              <span className="sr-only">ข้อความท้ายเว็บ</span>
              <textarea
                rows={3}
                maxLength={120}
                value={layout.tagline}
                onChange={(e) =>
                  setLayout({ ...layout, tagline: e.target.value })
                }
              />
            </label>
            <h3>หมวดที่แสดงในเมนู</h3>
            <div className="category-tags">
              {layout.categories.map((c) => (
                <span key={c}>
                  {c}
                  <button
                    aria-label={`นำหมวด ${c} ออกจากเมนู`}
                    onClick={() =>
                      setLayout({
                        ...layout,
                        categories: layout.categories.filter((x) => x !== c),
                      })
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="add-category"
              onSubmit={(e) => {
                e.preventDefault();
                const c = newCategory.trim();
                if (c && !layout.categories.includes(c)) {
                  setLayout({
                    ...layout,
                    categories: [...layout.categories, c],
                  });
                  setNewCategory("");
                }
              }}
            >
              <input
                aria-label="ชื่อหมวดใหม่"
                placeholder="เพิ่มหมวดใหม่"
                maxLength={60}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button className="icon-button" aria-label="เพิ่มหมวด">
                <Plus size={16} />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
function ImportPanel({
  busy,
  entries,
  onImport,
}: {
  busy: boolean;
  entries: Entry[];
  onImport: (entries: unknown[]) => Promise<void>;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const example = [
    {
      kind: "game",
      title: "ชื่อเกม",
      description: "คำอธิบายเกมที่ตรวจสอบจากต้นทางแล้ว",
      author: "ชื่อผู้สร้าง",
      category: "ผจญภัย",
      url: "https://example.com/game",
      sourceUrl: "https://example.com/original-post",
      image: "",
      tags: ["สร้างด้วย AI"],
      body: "",
    },
  ];
  function download() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gameslash-entries.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="import-panel">
      <div className="studio-heading">
        <div>
          <span className="eyebrow">FROM DISCOVERY TO COLLECTION</span>
          <h1>นำเข้ารายการที่รวบรวมมา</h1>
          <p>
            วาง JSON จาก Dots หรือเอเจนต์ได้สูงสุดครั้งละ 50 รายการ
            ทุกชิ้นจะเริ่มเป็นฉบับร่าง
          </p>
        </div>
        <button className="button" onClick={download}>
          <Download size={15} />
          ส่งออกคลัง
        </button>
      </div>
      <div className="import-columns">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setDone(false);
            try {
              const items = JSON.parse(value);
              if (!Array.isArray(items))
                throw new Error("ข้อมูลต้องเป็น JSON array");
              await onImport(items);
              setValue("");
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            รายการ JSON
            <textarea
              className="code-input"
              rows={19}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
              placeholder="[ { ... } ]"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="success-notice" role="status">
              นำเข้าสำเร็จแล้ว
            </p>
          )}
          <button className="button primary" disabled={busy}>
            <Upload size={15} />
            ตรวจและนำเข้าเป็นฉบับร่าง
          </button>
        </form>
        <div className="import-guide">
          <h2>รูปแบบสำหรับเอเจนต์</h2>
          <p>
            เก็บลิงก์ต้นทางและเครดิตผู้สร้างทุกครั้ง
            รายการลิงก์ซ้ำจะถูกปฏิเสธทั้งชุด เพื่อให้แก้ไขก่อนนำเข้าใหม่
          </p>
          <pre>{JSON.stringify(example, null, 2)}</pre>
          <p>kind รองรับ game, tool, article และ post</p>
          <p>
            ภาพใช้ลิงก์ HTTPS หรือเว้นว่างได้
            <br />
            ไม่ต้องส่งไฟล์เกมเข้ามา
          </p>
        </div>
      </div>
    </div>
  );
}

function EditorDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="entry-drawer"
      aria-label="แก้ไขรายการ"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
