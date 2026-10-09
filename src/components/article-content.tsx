"use client";
import { createElement, type ReactNode } from "react";
import type { ArticleDocument } from "@/lib/article";
type Node = { type:string; text?:string; attrs?:Record<string, unknown>; marks?:{type:string;attrs?:{href:string}}[]; content?:Node[] };
export function legacyGuideDocument(body:string): ArticleDocument {
  const chunks=body.split(/\n\s*\n/).filter(Boolean);
  return {type:"doc",content:chunks.map((text,i)=>i%2 === 0 && i+1 < chunks.length ? {type:"heading" as const,attrs:{level:2 as const},content:[{type:"text" as const,text}]} : {type:"paragraph" as const,content:[{type:"text" as const,text}]})};
}
function render(node:Node, key:number):ReactNode {
  const children=node.content?.map(render);
  if(node.type === "text") return (node.marks || []).reduce<ReactNode>((value,mark) => mark.type === "link" ? <a key={key} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer">{value}</a> : createElement(({bold:"strong",italic:"em",strike:"s",underline:"u",code:"code"} as Record<string,string>)[mark.type], {key}, value), node.text);
  if(node.type === "image") return <figure key={key}><img src={String(node.attrs?.src)} alt={String(node.attrs?.alt || "")} loading="lazy" />{node.attrs?.title ? <figcaption>{String(node.attrs.title)}</figcaption> : null}</figure>;
  if(node.type === "codeBlock") return <pre key={key}><code>{children}</code></pre>;
  const tag = node.type === "heading" ? `h${node.attrs?.level}` : ({paragraph:"p",bulletList:"ul",orderedList:"ol",listItem:"li",blockquote:"blockquote",hardBreak:"br",horizontalRule:"hr"} as Record<string,string>)[node.type];
  return tag ? createElement(tag, {key,...(node.type === "orderedList" ? {start:node.attrs?.start} : {}),...(node.type === "heading" && node.attrs?.level === 2 ? {id:`section-${key}`} : {})}, children) : null;
}
export function ArticleContent({content,body="",metadata}:{content?:ArticleDocument;body?:string;metadata?:ReactNode}) {
  const headings=content?.content.flatMap((node,i)=>node.type === "heading" && node.attrs?.level === 2 ? [{id:`section-${i}`,text:node.content?.map(n=>n.type === "text" ? n.text : " ").join("") || ""}] : []) || [];
  const toc = headings.length > 1 && <nav aria-label="สารบัญบทความ"><details className="article-toc" onKeyDown={e=>{if(e.key === "Escape") e.currentTarget.removeAttribute("open");}}><summary>ในบทความนี้ <span>{headings.length} หัวข้อ</span></summary><ol>{headings.map(h=><li key={h.id}><a href={`#${h.id}`} onClick={e=>e.currentTarget.closest("details")?.removeAttribute("open")}>{h.text}</a></li>)}</ol></details></nav>;
  return <>
    {metadata ? <div className="game-article-overview">{metadata}{toc}</div> : toc}
    <div className="article-prose">{content ? content.content.map(render) : body.split(/\n\s*\n/).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>
  </>;
}
