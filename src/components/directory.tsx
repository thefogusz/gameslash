"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  Sprout,
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
export function Cover({
  entry,
  priority = false,
}: {
  entry: Entry;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (entry.image && !failed)
    return (
      <Image
        fill
        unoptimized={!entry.image.startsWith("/")}
        src={entry.image}
        alt={`ภาพประชาสัมพันธ์ ${entry.title}`}
        sizes="(max-width: 700px) 90vw, 40vw"
        priority={priority}
        onError={() => setFailed(true)}
        className={`cover-image ${entry.id === "ai-dungeon" ? "contain" : ""}`}
      />
    );
  return (
    <div
      className={`cover-fallback art-${entry.id === "infinite-craft" ? "craft" : entry.kind}`}
      aria-hidden="true"
    >
      {entry.id === "infinite-craft" ? (
        <>
          <span className="craft-symbol">∞</span>
          <span className="craft-caption">
            a little curiosity. infinite possibilities.
          </span>
        </>
      ) : entry.kind === "article" ? (
        <>
          <span className="editorial-index">
            {entry.id === "first-small-game" ? "01" : "02"}
            <span>/</span>
          </span>
          <span className="editorial-caption">THE MAKER’S NOTEBOOK</span>
        </>
      ) : entry.id === "ai-town" ? (
        <>
          <Sprout size={56} strokeWidth={1} />
          <span className="fallback-title">a town of possibilities.</span>
        </>
      ) : (
        <>
          <Gamepad2 size={48} strokeWidth={1} />
          <span className="fallback-title">{entry.title}</span>
        </>
      )}
    </div>
  );
}
export function GameCard({ entry }: { entry: Entry }) {
  return (
    <Link href={`/item/${entry.id}`} className="game-card">
      <div className="game-cover">
        <Cover entry={entry} />
        <span className="cover-link">
          <ArrowUpRight size={18} />
        </span>
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
  const selected = layout.featuredIds
    .map((id) => entries.find((e) => e.id === id && e.kind === "game"))
    .filter((e): e is Entry => !!e);
  if (!selected.length) return null;
  return (
    <div className="featured-wall">
      {selected.map((entry, index) => (
        <Link
          href={`/item/${entry.id}`}
          key={entry.id}
          className={`feature-tile ${index === 0 ? "feature-main" : ""}`}
        >
          <Cover entry={entry} priority={index === 0} />
          <div className="feature-shade" />
          {index === 0 && (
            <span className="feature-badge">
              <Sparkles size={12} /> เกมแนะนำ
            </span>
          )}
          <div className="feature-copy">
            <span className="feature-category">{entry.category}</span>
            <h2>{entry.title}</h2>
            {index === 0 && <p>{entry.description}</p>}
          </div>
          <span className="feature-arrow">
            <ArrowUpRight size={index === 0 ? 23 : 18} />
          </span>
        </Link>
      ))}
    </div>
  );
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
      <p className="detail-description">{entry.description}</p>
      <div className="tags">
        {entry.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="prose">
        {entry.body
          .split("\n\n")
          .filter(Boolean)
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
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
  initialCategory = "",
  initialSort = "curated",
  submitType,
  item,
}: {
  catalog: Catalog;
  view: View;
  admin?: boolean;
  initialCategory?: string;
  initialSort?: string;
  submitType?: string;
  item?: Entry;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(initialCategory),
    [menu, setMenu] = useState(false);
  const [sort, setSort] = useState(initialSort);
  useEffect(() => setCategory(initialCategory), [initialCategory]);
  useEffect(() => setSort(initialSort), [initialSort]);
  const searching = !!query.trim();
  const browse =
    searching || ["games", "tools", "journal", "community"].includes(view);
  const kind = searching
    ? "game"
    : view === "tools"
      ? "tool"
      : view === "journal"
        ? "article"
        : view === "community"
          ? "post"
          : "game";
  const categories =
    kind === "game"
      ? catalog.layout.categories
      : [
          ...new Set(
            catalog.entries
              .filter((e) => e.kind === kind)
              .map((e) => e.category),
          ),
        ];
  const results = catalog.entries
    .filter(
      (e) =>
        e.kind === kind &&
        (!category || e.category === category) &&
        (!query ||
          `${e.title} ${e.description} ${e.author} ${e.tags.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())),
    )
    .sort((a, b) =>
      sort === "az"
        ? a.title.localeCompare(b.title, "th")
        : sort === "new"
          ? b.createdAt.localeCompare(a.createdAt)
          : 0,
    );
  const titles = {
    game: ["ค้นพบเกม", "ค้นหาเกมตามชื่อ ผู้สร้าง หรือหมวดหมู่"],
    tool: ["เครื่องมือทำเกม", "รวมเครื่องมือสำหรับสร้างและเผยแพร่เกม"],
    article: ["บทความ", "คู่มือและประสบการณ์สำหรับคนทำเกม"],
    post: ["คอมมูนิตี้", "แชร์ผลงาน ถามคำถาม และขอฟีดแบ็ก"],
  };
  function reset() {
    setQuery("");
    setCategory("");
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
              <i className="brand-mark" aria-hidden="true" />
              GAMESLASH
            </Link>
            <span className="brand-tagline">แพลตฟอร์มรวมเกม AI</span>
          </div>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="ค้นหาเกม"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCategory("");
            }}
            placeholder="ค้นหาเกม"
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
              className={
                view === "games" && !category
                  ? "sidebar-link active"
                  : "sidebar-link"
              }
            >
              เกมทั้งหมด
              <span className="side-count">
                {catalog.entries.filter((e) => e.kind === "game").length}
              </span>
            </Link>
            <Link href="/games?sort=new" className="sidebar-link">
              ใหม่ล่าสุด
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
                        "#6ff0cf",
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
        <main id="main" className="main-content">
          {browse ? (
            <>
              <div className="page-heading">
                <div className="heading-with-action">
                  <div>
                    <h1>
                      {searching ? `ผลการค้นหา “${query}”` : titles[kind][0]}
                    </h1>
                    <p>{titles[kind][1]}</p>
                  </div>
                  {kind === "post" && (
                    <Link href="/submit?type=post" className="button primary">
                      <Plus size={16} />
                      ส่งโพสต์
                    </Link>
                  )}
                </div>
              </div>
              <div className="filter-row">
                <div className="filter-chips">
                  <button
                    aria-pressed={!category}
                    onClick={() => setCategory("")}
                  >
                    ทั้งหมด
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c}
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <label className="sort-control">
                  <span className="sr-only">เรียงลำดับ</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="curated">คัดสรรโดยทีมงาน</option>
                    <option value="new">เพิ่มล่าสุด</option>
                    <option value="az">ตามชื่อ</option>
                  </select>
                </label>
              </div>
              <p className="result-count">
                {results.length} {kindLabels[kind]}
              </p>
              {!results.length ? (
                <Empty onReset={reset} />
              ) : (
                <div
                  className={`entries entries-${kind} template-grid browse-grid`}
                >
                  {results.map((e) =>
                    kind === "game" ? (
                      <GameCard key={e.id} entry={e} />
                    ) : kind === "tool" ? (
                      <ToolCard key={e.id} entry={e} />
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
