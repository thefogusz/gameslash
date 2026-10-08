"use client";
import { ArticleContent, legacyGuideDocument } from "./article-content";
import { ToolDirectoryCard } from "./tool-directory-card";
import { FilterSelect } from "./filter-select";
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
import { kindLabels as contentKindLabels, type Catalog, type Entry, type Layout } from "@/lib/model";
import { SubmitPanel } from "./entry-form";
import { Cover } from "./cover";
export { Cover } from "./cover";
import { Spotlight } from "./spotlight";
import { LikeButton, useGamePreferences } from "./game-preferences";
const kindLabels = { ...contentKindLabels, article: "ข่าว AI game" };
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
          อ่านต่อ <ArrowUpRight size={14} />
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
  const legacyGuide = entry.kind === "article" && !entry.content && ["first-small-game", "share-your-game"].includes(entry.id);
  const guideContent = legacyGuide ? legacyGuideDocument(entry.body) : entry.content;
  return (
    <article className={`detail detail-${entry.kind}`}>
      <Link href={`/${paths[entry.kind]}`} className="text-link">
        <ArrowLeft size={15} /> กลับไป{kindLabels[entry.kind]}
      </Link>
      {entry.kind === "game" && (
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
      {entry.kind === "article" && entry.image && <div className="detail-cover"><Cover entry={entry} priority /></div>}
      <ArticleContent content={guideContent} body={entry.body}/>
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
  const compactFilters = kind === "game" || kind === "article";
  const titles = {
    game: ["ค้นพบเกม", "ค้นหาเกมตามชื่อ ผู้สร้าง หรือหมวดหมู่"],
    tool: ["เครื่องมือทำเกม", "เลือกเครื่องมือที่ใช่ ตั้งแต่ไอเดีย เขียนโค้ด สร้างภาพ ไปจนถึงทดสอบเกม"],
    article: ["ข่าว AI game", "ข่าวสาร อัปเดต และเรื่องน่ารู้ในวงการเกม AI"],
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
            <Link
              href="/games"
              className={view === "games" && !category ? "sidebar-link active" : "sidebar-link"}
              onClick={() => setMenu(false)}
            >
              ค้นพบเกม
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
            <Link className="sidebar-link" href="/journal">
              <BookOpen size={16} />
              ข่าว AI game
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
              {kind === "tool" && <div className="tool-directory-heading" id="tool-directory">
                <h2>รวมเครื่องมือ</h2><span role="status" aria-live="polite">{results.length} เครื่องมือ</span>
              </div>}
              {kind === "tool" && <details className="popularity-method">
                <summary>ดาวความนิยมคิดจากอะไร?</summary>
                <p>Gameslash ประเมินจากหลักฐานฐานผู้ใช้ ผลงานและระบบนิเวศ และการเป็นที่รู้จักในวงการทำเกม คลิกดาวของแต่ละเครื่องมือเพื่อดูเหตุผล แหล่งข้อมูล และวันที่ตรวจ เป็นการประเมินเชิงเปรียบเทียบ ไม่ใช่ยอดผู้ใช้แบบเรียลไทม์หรือคะแนนคุณภาพ</p>
                <p>5 ดาว: แพร่หลายและมีหลักฐานเด่นครบทั้งสามด้าน · 4 ดาว: เป็นที่ยอมรับ มีหลักฐานหลายด้าน · 3 ดาว: มีชุมชนหรือผลงานชัดเจนในกลุ่มเฉพาะ · 2 ดาว: เริ่มมีการนำไปใช้ในกลุ่มเล็ก · 1 ดาว: มีหลักฐานว่ายังมีผู้ใช้น้อยมาก · หากหลักฐานไม่เพียงพอจะยังไม่ให้ดาว</p>
              </details>}
              {kind === "tool" && (
                <div className="filter-chips tool-categories" role="group" aria-label="ประเภทเครื่องมือ">
                  <button type="button" aria-pressed={!category} onClick={() => updateFilters({ category: "" })}>ทั้งหมด</button>
                  {categories.map(c => (
                    <button type="button" key={c} aria-pressed={category === c} onClick={() => updateFilters({ category: c })}>{c}</button>
                  ))}
                </div>
              )}
              {kind !== "tool" && <div className={`directory-filters${compactFilters ? " compact-filters" : ""}`} role="group" aria-label="ตัวกรองรายการ">
                <FilterSelect label="หมวดหมู่" compact={compactFilters} value={category}
                  options={[{ value: "", label: `ทุกหมวดหมู่ (${entries.length})` }, ...categories.map(c => ({ value: c, label: `${c} (${entries.filter(e => e.category === c).length})` }))]}
                  onChange={category => updateFilters({ category })} />
                <FilterSelect label={kind === "game" ? "แท็ก / แพลตฟอร์ม" : "แท็ก"} compact={compactFilters} value={tag}
                  options={[{ value: "", label: "ทุกแท็ก" }, ...tags.map(t => ({ value: t, label: `${t} (${entries.filter(e => e.tags.includes(t)).length})` }))]}
                  onChange={tag => updateFilters({ tag })} />
                <FilterSelect label="เรียงลำดับ" compact={compactFilters} value={sort}
                  options={Object.entries(directorySorts).map(([value, label]) => ({ value, label }))}
                  onChange={sort => updateFilters({ sort: sort === "curated" ? "" : sort })} />
                {(!compactFilters || filtered) && <button className="button secondary filter-reset" onClick={reset} disabled={!filtered}><X size={16} />ล้างตัวกรอง</button>}
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
          {view === "home" && <section className="discovery-about" aria-label="เกี่ยวกับ GameSlash">
            <h2>GameSlash — แพลตฟอร์มรวมเกม AI</h2>
            <p>ค้นพบเกมที่มี AI NPC เกมสร้างด้วย AI และประสบการณ์ใหม่ ๆ ทั้ง RPG ผจญภัย ปริศนา และจำลอง พร้อมเครื่องมือสร้างเกมและข่าวสำหรับคนสร้างเกม</p>
            <p lang="en">Discover AI games, intelligent NPCs and generative AI experiences, from RPGs and adventures to puzzle and simulation games. Explore AI game development tools and gaming news.</p>
          </section>}
          <footer className="site-footer">
            <Link href="/" className="wordmark small">
              game<span className="wordmark-slash">/</span>slash
            </Link>
            <p>{catalog.layout.tagline}</p>
            <div>
              <Link href="/submit">แนะนำเกม</Link>
              <span>© 2026 gameslash</span>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
