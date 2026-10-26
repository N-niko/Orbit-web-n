"use client";
import { OrbitSelect } from "./orbit-select";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BusFront, Camera, Check, Home, LogOut, Upload, X } from "lucide-react";
import { AccountLayout } from "./auth-screen";
import type { OrbitData, Profile } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AVATAR_BUCKET, AVATAR_TYPES, MAX_AVATAR_BYTES, RESIDENCE_HALLS } from "@/lib/account";

export function Onboarding({ profile, onSaved, onSignOut }: { profile: Profile; onSaved: (data: OrbitData) => void; onSignOut: () => Promise<void> }) {
  const [step, setStep] = useState(2 + Number(Boolean(profile.residency)));
  const [residency, setResidency] = useState<"commuter" | "resident" | "">(profile.residency || "");
  const [hall, setHall] = useState(profile.residenceHall || "");
  const [major, setMajor] = useState(profile.major);
  const [year, setYear] = useState(String(profile.graduationYear || ""));
  const [ready, setReady] = useState(false);
  const [needsStudentDetails, setNeedsStudentDetails] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploadedPath, setUploadedPath] = useState<string | null>(profile.avatarPath || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const client = getSupabaseBrowserClient();

  useEffect(() => {
    let disposed = false;
    void getSupabaseBrowserClient()?.auth.getUser().then(({ data }) => {
      if (disposed) return;
      const metadata = data.user?.user_metadata;
      const savedMajor = profile.major || (typeof metadata?.major === "string" ? metadata.major : "");
      const savedYear = profile.graduationYear || (Number.isInteger(metadata?.graduation_year) ? Number(metadata?.graduation_year) : null);
      if (!profile.major) setMajor(savedMajor);
      if (!profile.graduationYear && savedYear) setYear(String(savedYear));
      setNeedsStudentDetails(!savedMajor.trim() || !savedYear);
      setReady(true);
    }).catch(() => { if (!disposed) { setNeedsStudentDetails(!profile.major || !profile.graduationYear); setReady(true); } });
    return () => { disposed = true; };
  }, [profile.major, profile.graduationYear]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { heading.current?.focus(); }, [step]);

  function choosePhoto(next: File | null) {
    if (busy) return;
    setError("");
    if (next && (!AVATAR_TYPES.includes(next.type) || next.size > MAX_AVATAR_BYTES)) {
      setError("Choose a JPG, PNG, or WebP image up to 5 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(next); setUploadedPath(next ? null : profile.avatarPath || null);
    if (!next && fileInput.current) fileInput.current.value = "";
  }

  async function save(complete: boolean, skipPhoto = false) {
    if (!client) return;
    setBusy(true); setError("");
    let path = skipPhoto ? profile.avatarPath || null : uploadedPath;
    try {
      if (complete && file && !skipPhoto && !path) {
        const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error("Your photo couldn’t upload. Please try again, or skip the photo for now.");
        setUploadedPath(path);
      }
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        major, graduationYear: Number(year), residency, residenceHall: residency === "resident" ? hall : null,
        avatarPath: path, complete,
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t save your setup. Please try again.");
      onSaved(result);
      if (!complete) setStep(3);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save(step === 3); }
  return <AccountLayout step={step}>
    <div className="onboarding-top"><span className="account-eyebrow">A ONE-TIME HELLO</span><button className="account-text" disabled={busy} onClick={onSignOut}>Sign out <LogOut size={14} /></button></div>
    {step === 3 && <button className="account-back" disabled={busy} onClick={() => { setError(""); setStep(2); }}><ArrowLeft size={15} />Back to campus life</button>}
    <h2 ref={heading} tabIndex={-1}>{step === 2 ? "Where’s home for you?" : "Put a face to your name."}</h2>
    <p className="account-intro">{step === 2 ? "Whether you drive in or live on campus, there’s a place for you here." : "Help your people recognize you. A profile photo is completely optional."}</p>
    <form className="account-form" onSubmit={submit}><fieldset disabled={busy || !ready}>
      {step === 2 ? <>
        <div className="residency-options">{([{ value: "commuter", title: "I’m a commuter", detail: "Campus life, on my schedule.", Icon: BusFront }, { value: "resident", title: "I’m a resident", detail: "Making campus feel like home.", Icon: Home }] as const).map(({ value, title, detail, Icon }) => <label key={value} className={`residency-option ${residency === value ? "selected" : ""}`}><input type="radio" name="residency" value={value} checked={residency === value} required onChange={() => { setResidency(value); if (value === "commuter") setHall(""); }} /><Icon size={26} strokeWidth={1.5} /><strong>{title}</strong><span>{detail}</span><i aria-hidden="true">{residency === value && <Check size={12} />}</i></label>)}</div>
        {residency === "resident" && <label className="field">Residence hall<OrbitSelect aria-label="Residence hall" required value={hall} onChange={event => setHall(event.target.value)}><option value="">Choose your residence hall</option>{RESIDENCE_HALLS.map(value => <option key={value}>{value}</option>)}</OrbitSelect><small className="account-hint">This helps personalize your campus experience. Roommate spaces still require an invite.</small></label>}
        {needsStudentDetails && <div className="account-form-grid"><label className="field">Major<input required maxLength={100} value={major} onChange={event => setMajor(event.target.value)} placeholder="Your major, or Undecided" /></label><label className="field">Graduation year<input type="number" required min={2000} max={2100} value={year} onChange={event => setYear(event.target.value)} placeholder="e.g. 2030" /></label></div>}
        <div className="account-note"><Home size={19} /><p>{residency === "resident" ? "Roommates, shared tasks, and splitting everyday costs—start with your own shared space." : "Your campus community, events, and conversations come with you."}</p></div>
      </> : <>
        <div className="photo-preview">{preview || profile.avatarUrl ? <img src={preview || profile.avatarUrl} alt="Your profile photo preview" /> : <span>{profile.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}<i><Camera size={20} /></i></div>
        <label className="photo-upload"><Upload size={21} /><strong>{file ? "Choose a different photo" : "Choose a profile photo"}</strong><span>JPG, PNG, or WebP · Up to 5 MB</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" onChange={event => choosePhoto(event.target.files?.[0] || null)} /></label>
        {file && <div className="photo-file"><span>{file.name}</span><button type="button" aria-label="Remove selected photo" onClick={() => choosePhoto(null)}><X size={16} /></button></div>}
        <p className="account-hint photo-privacy">Your photo will be visible to people in your shared workspaces.</p>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="account-submit" disabled={busy || !ready}>{busy ? "Saving…" : step === 2 ? "Continue" : "Finish setup"}<ArrowRight size={17} /></button>
      {step === 3 && <button type="button" className="account-skip" disabled={busy} onClick={() => void save(true, true)}>Continue without a photo</button>}
    </fieldset></form>
  </AccountLayout>;
}
