"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { CampusEvent, OrbitAction } from "@/lib/types";
import { eventResponse,eventStatus } from "@/lib/events";
import { actionError } from "./secondary-shared";

export function EventResponseControls({ event, userId, onAction, now=Date.now() }: {
  now?:number; event: CampusEvent; userId: string; onAction: (action: OrbitAction) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const response = eventResponse(event, userId);
  const past = eventStatus(event,now)==="past";
  async function save(action: OrbitAction) {
    if (pending) return;
    setPending(true); setError("");
    try { await onAction(action); } catch (cause) { setError(actionError(cause)); }
    finally { setPending(false); }
  }
  return <div className="event-response-controls" aria-label={`Your response to ${event.title}`}>
    {event.removed ? <button className="btn btn-secondary" disabled={pending} onClick={() => { void save({ type: "restore_event", id: event.id }); }}><RotateCcw size={14} />Restore</button> : <>
      <div className="event-response-options">
        <button className={`btn ${response === "going" ? "btn-primary" : "btn-secondary"}`} disabled={pending || past} aria-pressed={response === "going"} onClick={() => { void save({ type: "respond_event", id: event.id, response: "going" }); }}><Check size={14} />Going</button>
        <button className={`btn btn-secondary${response === "not_going" ? " event-response-selected" : ""}`} disabled={pending || past} aria-pressed={response === "not_going"} onClick={() => { void save({ type: "respond_event", id: event.id, response: "not_going" }); }}><X size={14} />Not going</button>
      </div>
      {response === "not_going" && <button className="text-button event-remove" disabled={pending} onClick={() => { void save({ type: "remove_event", id: event.id }); }}>Remove from my plans</button>}
    </>}
    {past && <small>Ended · Your response is saved.</small>}
    {pending && <small role="status">Saving…</small>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
