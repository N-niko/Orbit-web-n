"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Search, Users, UserRound, X } from "lucide-react";
import { searchDirectory, withDirectoryPeople, type Directory, type SearchTarget } from "@/lib/discovery";
import { directoryProfileSchema, peopleQuerySchema, peopleResponseSchema, type DirectoryProfile } from "@/lib/people-search";
import "./discovery.css";

const categories = { person: { label: "Person", Icon: UserRound }, club: { label: "Club", Icon: Users }, event: { label: "Event", Icon: CalendarDays } };
export function OrbitSearch({ directory, onSelect, demo }: { directory: Directory; onSelect: (target: SearchTarget, person?: DirectoryProfile) => void; demo: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | SearchTarget["type"]>("all");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [remote, setRemote] = useState<{ query: string; people: DirectoryProfile[]; status: "loading" | "ready" | "error"; error?: string }>({ query: "", people: [], status: "ready" });
  const [retry, setRetry] = useState(0);
  const term = query.trim();
  const searchPeople = open && !demo && (scope === "all" || scope === "person") && peopleQuerySchema.safeParse(term).success;
  const available = withDirectoryPeople(directory, searchPeople && remote.query === term ? remote.people : []);
  const results = searchDirectory(available, query, scope);
  const searching = searchPeople && (remote.query !== term || remote.status === "loading");
  const searchError = searchPeople && remote.query === term && remote.status === "error" ? remote.error : "";
  useEffect(() => {
    if (!searchPeople) return;
    const controller = new AbortController();
    setRemote({ query: term, people: [], status: "loading" });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/people?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "People search is unavailable. Please try again.");
        const parsed = peopleResponseSchema.parse(result);
        if (!controller.signal.aborted) setRemote({ query: term, people: parsed.people, status: "ready" });
      } catch (cause) {
        if (!controller.signal.aborted) setRemote({ query: term, people: [], status: "error", error: cause instanceof Error ? cause.message : "People search is unavailable. Please try again." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchPeople, term, retry]);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) { setOpen(false); setActive(-1); } }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open, id]);
  function choose(target: SearchTarget) {
    const person = target.type === "person" ? available.people.find(person => person.profile.id === target.id) : undefined;
    setOpen(false); setQuery(""); setActive(-1);
    onSelect(target, !demo && person ? directoryProfileSchema.parse({ ...person.profile, graduationYear: person.profile.graduationYear ?? null }) : undefined);
  }

  return <div ref={root} className="orbit-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); input.current?.focus(); setOpen(false); setActive(-1); } }}>
    <div className="global-search"><Search size={17} aria-hidden="true" /><input ref={input} role="combobox" aria-label="Search your Orbit" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 && active < results.length ? `${id}-${active}` : undefined}
      placeholder="Search your Orbit…" autoComplete="off" maxLength={100} value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); if (results.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % results.length : (index <= 0 ? results.length : index) - 1); }
        if (event.key === "Enter" && open && results.length) { event.preventDefault(); choose(results[active >= 0 && active < results.length ? active : 0]); }
      }} />{query && <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { setQuery(""); setActive(-1); input.current?.focus(); }}><X size={15} /></button>}</div>
    {open && <div className="search-popover"><div className="search-popover-heading"><strong>Find your Orbit</strong><span>{demo ? "Demo directory" : "Orbit directory"}</span></div>
      <div className="search-scopes" aria-label="Search categories">{([{ value: "all", label: "All" }, { value: "person", label: "People" }, { value: "club", label: "Clubs" }, { value: "event", label: "Events" }] as const).map(item => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => { setScope(item.value); setActive(-1); }}>{item.label}</button>)}</div>
      <p className="search-count" role="status">{searching ? "Searching Orbit people…" : query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : demo ? "Explore people, clubs, and upcoming plans" : "Type 2 or more characters to find people across Orbit"}</p>
      {searchError && <div className="search-error" role="alert"><p>{searchError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      <div id={`${id}-results`} role="listbox" aria-label="Search results" className="search-results">
        {results.map((result, index) => { const { label, Icon } = categories[result.type]; return <button key={`${result.type}-${result.id}`} type="button" role="option" tabIndex={-1} id={`${id}-${index}`} aria-selected={active === index} className="search-result" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}>
          <span className={`search-result-icon result-${result.type}`}><Icon size={18} /></span><span><strong>{result.title}</strong><small><b className={`result-label-${result.type}`}>{label}</b><span> · {result.subtitle}</span></small></span>
        </button>; })}
      </div>
      {!results.length && !searching && !searchError && <div className="search-empty"><Search size={23} /><strong>No matches yet.</strong><p>{scope === "club" && !demo ? "Club previews are available in the demo." : !demo && term.length < 2 ? "Enter at least 2 characters to search all Orbit accounts." : "Try another name, club, or event."}</p></div>}
      <div className="search-footer">People first, then clubs and events.</div>
    </div>}
  </div>;
}
