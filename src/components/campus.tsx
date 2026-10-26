"use client";

import { useState } from "react";
import { ArrowUpRight, BookOpen, Bus, CalendarDays, Compass, ExternalLink, GraduationCap, Heart, Laptop, MapPin, Search, ShieldCheck, Users, Utensils, type LucideIcon } from "lucide-react";
import "./secondary.css";

type Resource = { title: string; description: string; category: string; icon: LucideIcon; url: string; color: string };
const resources: Resource[] = [
  { title: "Cougar One Stop", description: "Advising, registration, financial services, and career support in one place.", category: "Academics", icon: GraduationCap, url: "https://www.caldwell.edu/cougar-one-stop/", color: "lavender" },
  { title: "Jennings Library", description: "Your next great idea starts with research, books, and a quiet place to study.", category: "Academics", icon: BookOpen, url: "https://www.caldwell.edu/library/", color: "peach" },
  { title: "Academic Calendar", description: "Keep up with semester dates, registration, and breaks.", category: "Academics", icon: CalendarDays, url: "https://my.caldwell.edu/ICS/Calendar.jnz", color: "blue" },
  { title: "Clubs & Organizations", description: "Find your people through campus clubs and student organizations.", category: "Student life", icon: Users, url: "https://www.caldwell.edu/campus-life/clubs/", color: "mint" },
  { title: "Housing & Dining", description: "Find residence information, meal plans, dining options, and more.", category: "Student life", icon: Utensils, url: "https://www.caldwell.edu/campus-life/housing-dining/", color: "peach" },
  { title: "Campus Safety", description: "Official information about parking, campus IDs, security, and alerts.", category: "Support", icon: ShieldCheck, url: "https://www.caldwell.edu/safety/", color: "lavender" },
  { title: "Registrar", description: "Get help with courses, transcripts, graduation, and student records.", category: "Academics", icon: GraduationCap, url: "https://www.caldwell.edu/registrar/", color: "mint" },
  { title: "Technology & IT", description: "Access student tools and official help for Caldwell accounts and technology.", category: "Support", icon: Laptop, url: "https://www.caldwell.edu/current-students/", color: "blue" },
  { title: "Health & Wellness", description: "Explore the university’s student wellness and support resources.", category: "Support", icon: Heart, url: "https://www.caldwell.edu/current-students/", color: "peach" },
  { title: "Cougar Express", description: "Check Caldwell’s official shuttle information before you head out.", category: "Getting around", icon: Bus, url: "https://www.caldwell.edu/campus-life/cougarexpress/", color: "lavender" },
  { title: "Map & Directions", description: "Find your way to campus at 120 Bloomfield Avenue, Caldwell, New Jersey.", category: "Getting around", icon: MapPin, url: "https://www.caldwell.edu/admissions/visit-us/", color: "mint" },
  { title: "Current Student Hub", description: "A direct route to official student services, tools, and campus information.", category: "Support", icon: Compass, url: "https://www.caldwell.edu/current-students/", color: "blue" },
];

export function CampusView({ search = "", onClearSearch }: { search?: string; onClearSearch?: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All resources");
  const filtered = resources.filter((resource) => (category === "All resources" || category === resource.category) && [search, query].every((term) => `${resource.title} ${resource.description} ${resource.category}`.toLowerCase().includes(term.trim().toLowerCase())));

  return <div className="secondary-view campus-view"><div className="view-heading"><div><h1>Campus hub</h1><p className="muted">Offices, services and links for Caldwell students.</p></div><a className="btn btn-secondary" href="https://www.caldwell.edu/current-students/" target="_blank" rel="noopener noreferrer">Student hub<ArrowUpRight size={17} /></a></div>
    <div className="campus-toolbar"><div className="secondary-filter-pills" aria-label="Resource category">{["All resources", "Academics", "Student life", "Support", "Getting around"].map((item) => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="campus-resource-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a resource…" aria-label="Find a campus resource" /></label></div>
    <div className="campus-resource-grid">{filtered.map((resource) => <a key={resource.title} href={resource.url} target="_blank" rel="noopener noreferrer" className="panel campus-resource-card"><div className="campus-resource-top"><span className={`secondary-stat-icon ${resource.color}`}><resource.icon size={22} strokeWidth={1.7} /></span><ArrowUpRight size={19} className="campus-resource-arrow" /></div><span className="campus-resource-category">{resource.category}</span><h2>{resource.title}</h2><p>{resource.description}</p><span className="campus-resource-official"><ExternalLink size={12} />Official Caldwell resource</span></a>)}</div>
    {!filtered.length && <div className="panel empty-state"><Search size={30} /><h3>No resource found</h3><p>Try another word or select a different category.</p><button className="btn btn-secondary" onClick={() => { setQuery(""); setCategory("All resources"); onClearSearch?.(); }}>Reset filters</button></div>}
    <div className="campus-source-note"><ShieldCheck size={16} /><span>These links open Caldwell University’s official websites. Check the university pages for the latest details.</span></div>
  </div>;
}
