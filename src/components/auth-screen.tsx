"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, GraduationCap, Mail, Orbit } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { accountPassword, passwordChecks, signupSchema } from "@/lib/account";
import "./account.css";

export function AccountLayout({ children, step }: { children: ReactNode; step?: number }) {
  return <main className="account-page"><section className="account-story" aria-label="Welcome to Orbit">
    <a className="account-brand" href="/" aria-label="Orbit home"><span className="logo-mark"><Orbit size={28} /></span>orbit<span>.</span></a>
    <div className="account-story-copy"><span className="account-kicker"><GraduationCap size={16} /> MADE FOR CALDWELL</span>
      <h1>A little closer<br />to your <em>people.</em></h1><p>Your campus. Your plans. Your everyday.<br />Find where you belong, together.</p>
      <div className="account-art" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><span className="art-center"><Orbit size={64} strokeWidth={1} /></span><span className="art-note note-plans">✦ &nbsp; Plans worth showing up for</span><span className="art-note note-home">⌂ &nbsp; A space that feels like you</span><span className="art-spark">✳</span><span className="art-dot" /></div>
    </div><p className="account-story-footer">YOUR CAMPUS, A LITTLE CLOSER.</p>
  </section><section className="account-content"><div className="account-card">
    {step && <ol className="account-steps" aria-label="Account setup">{["Your account", "Campus life", "Your photo"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step > index + 1 ? "done" : step === index + 1 ? "current" : ""}><span>{step > index + 1 ? <Check size={14} /> : index + 1}</span><small>{label}</small></li>)}</ol>}
    {children}</div><p className="account-footer">A little connection goes a long way.</p></section></main>;
}

export function PasswordField({ value, onChange, strong = false }: { value: string; onChange: (value: string) => void; strong?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div><label className="field" htmlFor="account-password">{strong ? "Choose a password" : "Password"}</label><div className="account-password"><input id="account-password" name="password" type={visible ? "text" : "password"} autoComplete={strong ? "new-password" : "current-password"} required maxLength={128} minLength={strong ? 8 : undefined} value={value} onChange={event => onChange(event.target.value)} aria-describedby={strong ? "password-rules" : undefined} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
    {strong && <ul id="password-rules" className="password-rules">{passwordChecks.map(check => <li key={check.label} className={check.test(value) ? "met" : ""}><Check size={12} />{check.label}</li>)}</ul>}</div>;
}

type Mode = "signin" | "signup" | "forgot" | "reset" | "confirm";
export function AuthScreen({ recovery = false, notice = "", onRecoveryDone }: { recovery?: boolean; notice?: string; onRecoveryDone: () => void }) {
  const [mode, setMode] = useState<Mode>(recovery ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const client = getSupabaseBrowserClient();
  function switchMode(next: Mode) { if (busy) return; setMode(next); setError(""); setMessage(""); setPassword(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "signup") {
        const input = signupSchema.safeParse({ name: form.get("name"), email: email.trim(), password, major: form.get("major"), graduationYear: Number(form.get("graduationYear")) });
        if (!input.success) throw new Error(input.error.issues[0]?.message ?? "Check your details.");
        const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn’t create your account. Please try again.");
        setPassword("");
        if (result.confirmationRequired) setMode("confirm"); else window.location.assign("/");
      } else if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/recovery` });
        if (error) throw error;
        setMessage("If an account exists for this email, you’ll receive a password reset link. Open it in this browser.");
      } else if (mode === "reset") {
        const parsed = accountPassword.safeParse(password);
        if (!parsed.success) throw new Error("Use 8+ characters, an uppercase letter, a number, and a special character.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setPassword(""); onRecoveryDone();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  const signup = mode === "signup";
  return <AccountLayout step={signup || mode === "confirm" ? 1 : undefined}>
    {(mode === "signin" || signup) && <div className="account-tabs" aria-label="Account options"><button aria-pressed={mode === "signin"} onClick={() => switchMode("signin")}>Log in</button><button aria-pressed={signup} onClick={() => switchMode("signup")}>Create an account</button></div>}
    {mode === "confirm" ? <div className="account-confirm"><span className="account-icon"><Mail size={28} /></span><p className="account-eyebrow">ONE QUICK CHECK</p><h2>Check your inbox.</h2><p>We sent a confirmation link to <strong>{email}</strong>. Open it in this browser to continue with campus life and your photo.</p><p className="account-hint">Check your spam folder too. Once confirmed, you can also log in below to continue setup.</p><button className="account-submit" onClick={() => switchMode("signin")}>Back to log in <ArrowRight size={17} /></button><button className="account-text" onClick={() => switchMode("signup")}>Use a different email</button></div> : <>
      {(mode === "forgot") && <button className="account-back" onClick={() => switchMode("signin")}><ArrowLeft size={15} />Back to log in</button>}
      <p className="account-eyebrow">{signup ? "LET’S START WITH YOU" : mode === "forgot" ? "A LITTLE HELP GETTING BACK" : mode === "reset" ? "A FRESH START" : "YOUR EVERYDAY ORBIT"}</p>
      <h2>{signup ? "Find your people." : mode === "forgot" ? "Forgot your password?" : mode === "reset" ? "Choose a new password." : "Welcome back."}</h2>
      <p className="account-intro">{signup ? "A few details, then you’re on your way." : mode === "forgot" ? "We’ll email you a link to reset it." : mode === "reset" ? "Make it something only you know." : "Good to see you. Let’s get you back in your Orbit."}</p>
      {notice && <p className="form-error" role="alert">{notice}</p>}
      {!client && <p className="form-error" role="alert">Accounts are temporarily unavailable. Please try again later.</p>}
      <form className="account-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          {signup && <label className="field">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Your first and last name" /></label>}
          {mode !== "reset" && <label className="field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />{signup && <small className="account-hint">Any email works for now.</small>}</label>}
          {mode !== "forgot" && <PasswordField value={password} onChange={setPassword} strong={signup || mode === "reset"} />}
          {signup && <div className="account-form-grid"><label className="field">Major<input name="major" required maxLength={100} placeholder="e.g. Biology or Undecided" /></label><label className="field">Graduation year<input name="graduationYear" type="number" inputMode="numeric" required min={2000} max={2100} placeholder="e.g. 2030" /></label></div>}
          {mode === "signin" && <button className="account-forgot" type="button" onClick={() => switchMode("forgot")}>Forgot password?</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="account-submit" disabled={busy || !client} type="submit">{busy ? "One moment…" : signup ? "Create account & continue" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Save new password" : "Log in"}<ArrowRight size={17} /></button>
        </fieldset>
      </form>
      {signup ? <p className="account-switch">Already have an account? <button onClick={() => switchMode("signin")}>Log in</button></p> : mode === "signin" ? <p className="account-switch">New around here? <button onClick={() => switchMode("signup")}>Create an account</button></p> : null}
    </>}
  </AccountLayout>;
}
