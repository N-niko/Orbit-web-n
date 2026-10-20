"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Search, Users, UserRound, X } from "lucide-react";
import { searchDirectory, type Directory, type SearchTarget } from "@/lib/discovery";
import "./discovery.css";

const categories = { person: { label: "Person", Icon: UserRound }, club: { label: "Club", Icon: Users }, event: { label: "Event", Icon: CalendarDays } };
export function OrbitSearch({ directory, onSelect, demo }: { directory: Directory; onSelect: (target: SearchTarget) => void; demo: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | SearchTarget["type"]>("all");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = searchDirectory(directory, query, scope);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) { setOpen(false); setActive(-1); } }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open, id]);
  function choose(target: SearchTarget) { setOpen(false); setQuery(""); setActive(-1); onSelect(target); }

  return <div ref={root} className="orbit-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); input.current?.focus(); setOpen(false); setActive(-1); } }}>
    <div className="global-search"><Search size={17} aria-hidden="true" /><input ref={input} role="combobox" aria-label="Search your Orbit" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 && active < results.length ? `${id}-${active}` : undefined}
      placeholder="Search your Orbit…" autoComplete="off" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); if (results.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % results.length : (index <= 0 ? results.length : index) - 1); }
        if (event.key === "Enter" && open && results.length) { event.preventDefault(); choose(results[active >= 0 && active < results.length ? active : 0]); }
      }} />{query && <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { setQuery(""); setActive(-1); input.current?.focus(); }}><X size={15} /></button>}</div>
    {open && <div className="search-popover"><div className="search-popover-heading"><strong>Find your Orbit</strong><span>{demo ? "Demo directory" : "Your workspace"}</span></div>
      <div className="search-scopes" aria-label="Search categories">{([{ value: "all", label: "All" }, { value: "person", label: "People" }, { value: "club", label: "Clubs" }, { value: "event", label: "Events" }] as const).map(item => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => { setScope(item.value); setActive(-1); }}>{item.label}</button>)}</div>
      <p className="search-count" role="status">{query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "Explore people, clubs, and upcoming plans"}</p>
      <div id={`${id}-results`} role="listbox" aria-label="Search results" className="search-results">
        {results.map((result, index) => { const { label, Icon } = categories[result.type]; return <button key={`${result.type}-${result.id}`} type="button" role="option" tabIndex={-1} id={`${id}-${index}`} aria-selected={active === index} className="search-result" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}>
          <span className={`search-result-icon result-${result.type}`}><Icon size={18} /></span><span><strong>{result.title}</strong><small><b className={`result-label-${result.type}`}>{label}</b><span> · {result.subtitle}</span></small></span>
        </button>; })}
      </div>
      {!results.length && <div className="search-empty"><Search size={23} /><strong>No matches yet.</strong><p>{scope === "club" && !demo ? "Club previews are available in the demo." : "Try another name, club, or event."}</p></div>}
      <div className="search-footer">People first, then clubs and events.</div>
    </div>}
  </div>;
}
