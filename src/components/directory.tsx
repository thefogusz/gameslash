"use client";
import { ArticleContent } from "./article-content";
import { ToolsGuide, ToolDirectoryCard } from "./tools-guide";
import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { directorySorts, filterDirectory, gameMakingTools, toolWorkflowCategories } from "@/lib/directory-filters";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  Sparkles,
  Gamepad2,
  BookOpen,
  Wrench,
  MessageCircle,
  Users,
  Menu,
  X,
  SlidersHorizontal,
  ExternalLink,
  Pencil,
  Globe,
} from "lucide-react";
import { kindLabels, type Catalog, type Entry, type Layout } from "@/lib/model";
import { SubmitPanel } from "./entry-form";
import { Cover } from "./cover";
export { Cover } from "./cover";
import { Spotlight } from "./spotlight";
import { LikeButton, useGamePreferences } from "./game-preferences";
export type View =
  | "home"
  | "games"
  | "tools"
  | "journal"
  | "community"
  | "submit"
  | "detail";
const paths = {
  game: "games",
  tool: "tools",
  article: "journal",
  post: "community",
};
export function GameCard({ entry }: { entry: Entry }) {
  return (
    <div className="game-card">
    <Link href={`/item/${entry.id}`} className="game-card-link">
      <div className="game-cover">
        <Cover entry={entry} />
        <span className="cover-tag">{entry.category}</span>
      </div>
      <div className="game-card-title">
        <h3>{entry.title}</h3>
        <ArrowUpRight size={15} />
      </div>
      <p>
        {entry.author}
        <span>·</span>
        {entry.tags.find((t) => t === "AI ในเกม" || t === "สร้างด้วย AI") ||
          entry.tags[0] ||
          entry.category}
      </p>
    </Link>
    <LikeButton id={entry.id} title={entry.title} compact />
    </div>
  );
}
function ArticleCard({ entry }: { entry: Entry }) {
  return (
    <Link href={`/item/${entry.id}`} className="article-card">
      <div className="article-cover">
        <Cover entry={entry} />
      </div>
      <div>
        <span className="eyebrow">{entry.category}</span>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <span className="text-link">
          อ่านบทความ <ArrowUpRight size={14} />
        </span>
      </div>
    </Link>
  );
}
function ToolCard({ entry }: { entry: Entry }) {
  return (
    <Link href={`/item/${entry.id}`} className="tool-card">
      <span className={`tool-monogram tool-${entry.id}`}>
        {entry.title.slice(0, 1)}
      </span>
      <div>
        <h3>
          {entry.title} <ArrowUpRight size={14} />
        </h3>
        <p>{entry.category}</p>
      </div>
    </Link>
  );
}
function PostCard({ entry }: { entry: Entry }) {
  return (
    <Link href={`/item/${entry.id}`} className="post-card">
      <span className="post-avatar">
        {entry.author.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <span className="post-meta">
          {entry.author} <span>· {entry.category}</span>
        </span>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
      </div>
      <ArrowUpRight size={18} />
    </Link>
  );
}
function Empty({ onReset }: { onReset?: () => void }) {
  return (
    <div className="empty-state">
      <Search size={28} strokeWidth={1.3} />
      <h2>ยังไม่พบรายการที่ตรงกัน</h2>
      <p>ลองคำค้นอื่น หรือกลับไปดูรายการทั้งหมด</p>
      {onReset && (
        <button className="button" onClick={onReset}>
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
export function Featured({
  entries,
  layout,
}: {
  entries: Entry[];
  layout: Layout;
}) {
  return <Spotlight entries={entries} layout={layout} />;
}
export function CatalogSection({
  section,
  entries,
}: {
  section: Layout["sections"][number];
  entries: Entry[];
}) {
  const rail = useRef<HTMLDivElement>(null);
  const items = entries.filter(
    (e) =>
      e.kind === section.kind &&
      (!section.category || e.category === section.category),
  );
  if (section.id === "discover")
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!items.length) return null;
  return (
    <section className={`catalog-section section-${section.kind}`}>
      <div className="section-heading">
        <div>
          <span className="section-marker" />
          <h2>{section.title}</h2>
        </div>
        <div className="section-actions">
          <Link
            href={`/${paths[section.kind]}${section.category ? `?category=${encodeURIComponent(section.category)}` : ""}`}
            className="text-link"
          >
            ดูทั้งหมด <ArrowUpRight size={14} />
          </Link>
          {section.template === "shelf" && (
            <div className="rail-controls">
              <button
                aria-label={`เลื่อน ${section.title} ไปทางซ้าย`}
                onClick={() =>
                  rail.current?.scrollBy({ left: -300, behavior: "smooth" })
                }
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label={`เลื่อน ${section.title} ไปทางขวา`}
                onClick={() =>
                  rail.current?.scrollBy({ left: 300, behavior: "smooth" })
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={rail}
        className={`entries entries-${section.kind} template-${section.template}`}
      >
        {items.map((entry) =>
          section.kind === "game" ? (
            <GameCard entry={entry} key={entry.id} />
          ) : section.kind === "article" ? (
            <ArticleCard entry={entry} key={entry.id} />
          ) : section.kind === "tool" ? (
            <ToolCard entry={entry} key={entry.id} />
          ) : (
            <PostCard entry={entry} key={entry.id} />
          ),
        )}
      </div>
    </section>
  );
}
export function HomeContent({
  catalog,
  editSection,
}: {
  catalog: Catalog;
  editSection?: (id: string) => void;
}) {
  return (
    <>
      {!editSection && <h1 className="sr-only">gameslash — รวมเกม AI</h1>}
      <div className={editSection ? "editable-region" : ""}>
        {editSection && (
          <button
            className="edit-region"
            onClick={() => editSection("featured")}
          >
            <Pencil size={12} /> แก้ไขเกมแนะนำ
          </button>
        )}
        <Featured entries={catalog.entries} layout={catalog.layout} />
      </div>
      {catalog.layout.sections
        .filter((s) => s.enabled)
        .map((s) => (
          <div key={s.id} className={editSection ? "editable-region" : ""}>
            {editSection && (
              <button className="edit-region" onClick={() => editSection(s.id)}>
                <Pencil size={12} /> แก้ไขส่วนนี้
              </button>
            )}
            <CatalogSection section={s} entries={catalog.entries} />
          </div>
        ))}
    </>
  );
}
function Detail({ entry }: { entry: Entry }) {
  return (
    <article className={`detail detail-${entry.kind}`}>
      <Link href={`/${paths[entry.kind]}`} className="text-link">
        <ArrowLeft size={15} /> กลับไป{kindLabels[entry.kind]}
      </Link>
      {(entry.kind === "game" || (entry.kind === "article" && entry.image)) && (
        <div className="detail-cover">
          <Cover entry={entry} priority />
        </div>
      )}
      <div className="detail-heading">
        <div>
          <span className="eyebrow">{entry.category}</span>
          <h1>{entry.title}</h1>
          <p>โดย {entry.author}</p>
        </div>
        <div className="detail-actions">
        {entry.kind === "game" && <LikeButton id={entry.id} title={entry.title} />}
        {entry.url && (
          <a
            className="button primary"
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {entry.kind === "game" ? "ไปเว็บไซต์เกม" : "เปิดเว็บไซต์"}{" "}
            <ArrowUpRight size={16} />
          </a>
        )}
        </div>
      </div>
      <p className="detail-description">{entry.description}</p>
      <div className="tags">
        {entry.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <ArticleContent content={entry.content} body={entry.body}/>
      {entry.kind === "game" && (
        <div className="source-note">
          <Globe size={18} />
          <p>
            เกมนี้อยู่บนเว็บไซต์ของผู้สร้าง
            <br />
            <span>gameslash รวบรวมข้อมูลและลิงก์เพื่อช่วยให้คุณค้นพบเกม</span>
          </p>
        </div>
      )}
      {entry.sourceUrl && (
        <a
          className="text-link"
          target="_blank"
          rel="noopener noreferrer"
          href={entry.sourceUrl}
        >
          ดูแหล่งที่มา <ExternalLink size={13} />
        </a>
      )}
      {entry.kind === "post" && (
        <div className="source-note">
          <MessageCircle size={22} />
          <p>
            มีไอเดียหรือประสบการณ์ที่อยากแบ่งปัน?
            <br />
            <Link className="text-link" href="/submit?type=post">
              ส่งโพสต์ของคุณ <ArrowRight size={14} />
            </Link>
          </p>
        </div>
      )}
    </article>
  );
}
export function Directory({
  catalog,
  view,
  admin = false,
  submitType,
  item,
}: {
  catalog: Catalog;
  view: View;
  admin?: boolean;
  submitType?: string;
  item?: Entry;
}) {
  const [menu, setMenu] = useState(false);
  const params = useSearchParams();
  const { likedIds, ready } = useGamePreferences();
  const likedOnly = params.get("liked") === "1" && view === "games";
  const query = params.get("q") || "";
  const category = view === "tools" && params.get("category") === "เผยแพร่" ? "" : params.get("category") || "";
  const tag = view === "tools" ? "" : params.get("tag") || "";
  const requestedSort = view === "tools" ? "curated" : params.get("sort") || "curated";
  const sort = Object.hasOwn(directorySorts, requestedSort) ? requestedSort : "curated";
  function updateFilters(values: Record<string, string>, replace = false) {
    const url = new URL(window.location.href);
    if (view === "tools") {
      url.searchParams.delete("tag");
      url.searchParams.delete("sort");
      if (url.searchParams.get("category") === "เผยแพร่") url.searchParams.delete("category");
    }
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history[replace ? "replaceState" : "pushState"](null, "", url.pathname + url.search);
  }
  const searching = !!query.trim();
  const browse =
    searching || ["games", "tools", "journal", "community"].includes(view);
  const kind = view === "tools"
      ? "tool"
      : view === "journal"
        ? "article"
        : view === "community"
          ? "post"
          : "game";
  const entries = kind === "tool" ? gameMakingTools(catalog.entries) : catalog.entries.filter(e => e.kind === kind);
  const categories = [...new Set([...(kind === "tool" ? toolWorkflowCategories : kind === "game" ? catalog.layout.categories : []), ...entries.map(e => e.category), ...(category ? [category] : [])])];
  const tags = [...new Set([...entries.flatMap(e => e.tags), ...(tag ? [tag] : [])])].sort((a,b) => a.localeCompare(b,"th"));
  const results = filterDirectory(likedOnly ? entries.filter(e => likedIds.includes(e.id)) : entries, { kind, query, category, tag, sort }, kind === "game" ? catalog.layout.featuredIds : []);
  const filtered = !!(query || category || tag || likedOnly || sort !== "curated");
  const titles = {
    game: ["ค้นพบเกม", "ค้นหาเกมตามชื่อ ผู้สร้าง หรือหมวดหมู่"],
    tool: ["สร้างเกมด้วย AI", "ไกด์ตั้งแต่ยังไม่มีไอเดียจนเกมพร้อมให้คนเล่น พร้อมรวมเครื่องมือที่ใช้ในแต่ละขั้น"],
    article: ["บทความ", "คู่มือและประสบการณ์สำหรับคนทำเกม"],
    post: ["คอมมูนิตี้", "แชร์ผลงาน ถามคำถาม และขอฟีดแบ็ก"],
  };
  function reset() {
    updateFilters({ q: "", category: "", tag: "", liked: "", sort: "" });
  }
  return (
    <>
      <a href="#main" className="skip-link">
        ข้ามไปยังเนื้อหา
      </a>
      <header className="topbar">
        <div className="topbar-start">
          <button
            className="icon-button mobile-menu"
            aria-label={menu ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="brand-identity">
            <Link href="/" className="wordmark">
              <img className="brand-mark" src="/gameslash-symbol.svg" alt="" width={34} height={34} />
              GAMESLASH
            </Link>
            <span className="brand-tagline">แพลตฟอร์มรวมเกม AI</span>
          </div>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label={`ค้นหา${kindLabels[kind]}`}
            value={query}
            onChange={(e) => {
              updateFilters({ q: e.target.value }, true);
            }}
            placeholder={`ค้นหา${kindLabels[kind]}`}
          />
        </label>
        <div className="topbar-end">
          {admin && (
            <Link
              className="icon-button admin-link"
              href="/admin"
              aria-label="จัดการเว็บ"
            >
              <SlidersHorizontal size={18} />
            </Link>
          )}
          <Link href="/submit" className="button dark submit-nav">
            <Plus size={16} />
            <span>ส่งเกม</span>
          </Link>
        </div>
      </header>
      <div className="app-layout">
        <aside
          className={`sidebar ${menu ? "sidebar-open" : ""}`}
          aria-label="สำรวจ gameslash"
        >
          <div className="sidebar-group">
            <Link
              href="/"
              className={
                view === "home" ? "sidebar-link active" : "sidebar-link"
              }
            >
              หน้าแรก
            </Link>
          </div>
          <div className="sidebar-group">
            {catalog.layout.categories.map((c, i) => {
              return (
                <Link
                  key={c}
                  href={`/games?category=${encodeURIComponent(c)}`}
                  className={`sidebar-link ${category === c ? "active" : ""}`}
                  onClick={() => setMenu(false)}
                >
                  <span
                    className="genre-swatch"
                    style={{
                      background: [
                        "#b99df0",
                        "var(--accent)",
                        "#b2db72",
                        "#ffd363",
                        "#ff8174",
                        "#82b8ee",
                        "#f4a766",
                      ][i % 7],
                    }}
                  />
                  {c}
                  <span className="side-count">
                    {catalog.entries.filter(
                      (e) => e.kind === "game" && e.category === c,
                    ).length || "—"}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="sidebar-group">
            <Link className="sidebar-link" href="/tools">
              <Wrench size={16} />
              เครื่องมือทำเกม
              <ArrowUpRight className="side-count" size={13} />
            </Link>
            <Link className="sidebar-link" href="/community">
              <MessageCircle size={16} />
              คอมมูนิตี้
            </Link>
            <Link className="sidebar-link" href="/journal">
              <BookOpen size={16} />
              บทความ
            </Link>
          </div>
        </aside>
        {menu && (
          <button
            className="sidebar-backdrop"
            aria-label="ปิดเมนู"
            onClick={() => setMenu(false)}
          />
        )}
        <main id="main" className={`main-content${kind === "tool" ? " tools-page" : ""}`}>
          {browse ? (
            <>
              <div className="page-heading">
                <div className="heading-with-action">
                  <div>
                    <h1>
                      {searching ? `ผลการค้นหา “${query}”` : likedOnly ? "เกมที่ถูกใจ" : titles[kind][0]}
                    </h1>
                    <p>{likedOnly ? "เก็บไว้ในเบราว์เซอร์นี้ ไม่ต้องสมัครสมาชิก" : titles[kind][1]}</p>
                  </div>
                  {kind === "post" && (
                    <Link href="/submit?type=post" className="button primary">
                      <Plus size={16} />
                      ส่งโพสต์
                    </Link>
                  )}
                </div>
              </div>
              {kind === "tool" && !searching && <>
                <a className="tools-directory-jump" href="#tool-directory">ดูรวมเครื่องมือ <ArrowRight size={16} /></a>
                <ToolsGuide entries={entries} />
              </>}
              {kind === "tool" && <div className="tool-directory-heading" id="tool-directory">
                <h2>รวมเครื่องมือ</h2><span role="status" aria-live="polite">{results.length} เครื่องมือ</span>
              </div>}
              {kind === "tool" && (
                <div className="filter-chips tool-categories" role="group" aria-label="ประเภทเครื่องมือ">
                  <button type="button" aria-pressed={!category} onClick={() => updateFilters({ category: "" })}>ทั้งหมด</button>
                  {categories.map(c => (
                    <button type="button" key={c} aria-pressed={category === c} onClick={() => updateFilters({ category: c })}>{c}</button>
                  ))}
                </div>
              )}
              {kind !== "tool" && <div className="directory-filters" role="group" aria-label="ตัวกรองรายการ">
                <label>หมวดหมู่
                  <select value={category} onChange={e => updateFilters({ category: e.target.value })}>
                    <option value="">ทุกหมวดหมู่ ({entries.length})</option>
                    {categories.map(c => <option key={c} value={c}>{c} ({entries.filter(e => e.category === c).length})</option>)}
                  </select>
                </label>
                <label>{kind === "game" ? "แท็ก / แพลตฟอร์ม" : "แท็ก"}
                  <select value={tag} onChange={e => updateFilters({ tag: e.target.value })}>
                    <option value="">ทุกแท็ก</option>
                    {tags.map(t => <option key={t} value={t}>{t} ({entries.filter(e => e.tags.includes(t)).length})</option>)}
                  </select>
                </label>
                <label>เรียงลำดับ
                  <select value={sort} onChange={e => updateFilters({ sort: e.target.value === "curated" ? "" : e.target.value })}>
                    {Object.entries(directorySorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <button className="button secondary filter-reset" onClick={reset} disabled={!filtered}><X size={16} />ล้างตัวกรอง</button>
              </div>}
              {kind !== "tool" && <p className="result-count" role="status" aria-live="polite">
                พบ {results.length} จาก {entries.length} {kindLabels[kind]}
              </p>}
              {likedOnly && !ready ? <p role="status">กำลังอ่านรายการที่ถูกใจ…</p> : !results.length ? (
                <Empty onReset={reset} />
              ) : (
                <div
                  className={kind === "tool" ? "tool-directory-grid" : `entries entries-${kind} template-grid browse-grid`}
                >
                  {results.map((e) =>
                    kind === "game" ? (
                      <GameCard key={e.id} entry={e} />
                    ) : kind === "tool" ? (
                      <ToolDirectoryCard key={e.id} entry={e} />
                    ) : kind === "article" ? (
                      <ArticleCard key={e.id} entry={e} />
                    ) : (
                      <PostCard key={e.id} entry={e} />
                    ),
                  )}
                </div>
              )}
              {kind === "post" && (
                <a
                  className="community-external"
                  href="https://www.facebook.com/groups/1108191221217612"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Users size={24} />
                  <div>
                    <strong>พบคนทำเกมอีกมากมาย</strong>
                    <p>ไปพูดคุยต่อที่กลุ่ม AI Game Dev Thailand บน Facebook</p>
                  </div>
                  <ArrowUpRight size={20} />
                </a>
              )}
            </>
          ) : view === "submit" ? (
            <SubmitPanel
              categories={catalog.layout.categories}
              type={submitType}
            />
          ) : view === "detail" && item ? (
            <Detail entry={item} />
          ) : (
            <HomeContent catalog={catalog} />
          )}
          <footer className="site-footer">
            <Link href="/" className="wordmark small">
              game<span className="wordmark-slash">/</span>slash
            </Link>
            <p>{catalog.layout.tagline}</p>
            <div>
              <Link href="/submit">แนะนำเกม</Link>
              <Link href="/admin">สำหรับผู้ดูแล</Link>
              <span>© 2026 gameslash</span>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
