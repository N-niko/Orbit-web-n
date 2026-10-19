"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Mail, Orbit } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ViewModal } from "./secondary-shared";

export function AuthDialog({ onClose, recovery = false }: { onClose: () => void; recovery?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(recovery ? "reset" : "signin");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(getSupabaseBrowserClient());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const redirect = `${window.location.origin}/auth/callback`;
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/recovery` });
        if (error) throw error;
        setMessage("Check your email for a password reset link.");
      } else if (mode === "reset") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Your password has been updated. You can close this window.");
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { name: String(form.get("name")).trim() }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) onClose(); else setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }

  function switchMode(next: typeof mode) { setMode(next); setMessage(""); setError(""); }

  return <ViewModal title={mode === "signup" ? "Find your people." : mode === "forgot" ? "Let’s get you back in." : mode === "reset" ? "A fresh start." : "Welcome to your Orbit."} onClose={onClose} busy={busy}>
    <div className="auth-brand"><span className="logo-mark"><Orbit size={26} /></span><span>orbit</span></div>
    <p className="muted auth-intro">{mode === "signup" ? "A little more connection. A little less campus chaos." : "Your campus, your roommates, and your everyday plans. All together."}</p>
    {!configured && <div className="setup-note"><Mail size={20} /><div><strong>Connect Supabase to enable accounts</strong><p>Add the values from .env.example and run the database migration. You can explore every feature in the demo now.</p></div></div>}
    <form onSubmit={submit} className="auth-form">
      {mode === "signup" && <label className="field">Your name<input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Alex Morgan" /></label>}
      {mode !== "reset" && <label className="field">University email<input name="email" type="email" autoComplete="email" required placeholder="you@caldwell.edu" /></label>}
      {mode !== "forgot" && <label className="field">{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} maxLength={128} placeholder="At least 8 characters" /></label>}
      {mode === "signin" && <button className="text-button forgot-link" type="button" onClick={() => switchMode("forgot")}>Forgot password?</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status"><CheckCircle2 size={18} />{message}</p>}
      <button className="btn btn-primary auth-submit" disabled={!configured || busy}>{busy ? "One moment…" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Sign in"}<ArrowRight size={17} /></button>
    </form>
    {mode !== "reset" && <p className="auth-switch">{mode === "signup" ? "Already in the loop?" : mode === "forgot" ? "Remember your password?" : "New around here?"} <button className="text-button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>}
    <div className="auth-demo-note">Demo data stays in this browser. Accounts use the connected database.</div>
  </ViewModal>;
}
