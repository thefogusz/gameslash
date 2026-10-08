import { createElement, type ReactNode } from "react";
import type { ArticleDocument } from "@/lib/article";
type Node = { type:string; text?:string; attrs?:Record<string, unknown>; marks?:{type:string;attrs?:{href:string}}[]; content?:Node[] };
function render(node:Node, key:number):ReactNode {
  const children=node.content?.map(render);
  if(node.type === "text") return (node.marks || []).reduce<ReactNode>((value,mark) => mark.type === "link" ? <a key={key} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer">{value}</a> : createElement(({bold:"strong",italic:"em",strike:"s",underline:"u",code:"code"} as Record<string,string>)[mark.type], {key}, value), node.text);
  if(node.type === "image") return <figure key={key}><img src={String(node.attrs?.src)} alt={String(node.attrs?.alt || "")} loading="lazy" />{node.attrs?.title ? <figcaption>{String(node.attrs.title)}</figcaption> : null}</figure>;
  if(node.type === "codeBlock") return <pre key={key}><code>{children}</code></pre>;
  const tag = node.type === "heading" ? `h${node.attrs?.level}` : ({paragraph:"p",bulletList:"ul",orderedList:"ol",listItem:"li",blockquote:"blockquote",hardBreak:"br",horizontalRule:"hr"} as Record<string,string>)[node.type];
  return tag ? createElement(tag, {key,...(node.type === "orderedList" ? {start:node.attrs?.start} : {})}, children) : null;
}
export function ArticleContent({content,body=""}:{content?:ArticleDocument;body?:string}) {
  return <div className="article-prose">{content ? content.content.map(render) : body.split(/\n\s*\n/).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>;
}
