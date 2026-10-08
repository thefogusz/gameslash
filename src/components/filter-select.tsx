"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function FilterSelect({ label, value, options, onChange, compact }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = Math.max(0, options.findIndex(option => option.value === value));

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }
  return <div className="filter-select" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span className={compact ? "sr-only" : "filter-select-label"}>{label}</span>
    <button ref={trigger} type="button" className="filter-select-trigger" role="combobox"
      aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      onClick={() => { setActive(selected); search.current.text = ""; setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === "Tab") { setOpen(false); return; }
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (open && ["Enter", " "].includes(event.key)) { choose(active); return; }
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : !open ? selected : Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowUp" ? -1 : 1)));
          setActive(next); setOpen(true); return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          search.current = { text: (now - search.current.at < 700 ? search.current.text : "") + event.key.toLocaleLowerCase(), at: now };
          const match = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text));
          if (match >= 0) { setActive(match); setOpen(true); }
        }
      }}>
      <span>{options[selected]?.label}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={id} className="filter-select-menu" role="listbox" aria-label={label}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} className={index === active ? "filter-select-option active" : "filter-select-option"}
        onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
