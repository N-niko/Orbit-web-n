"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { OrbitAction, OrbitData, Profile } from "@/lib/types";

export type ViewProps = {
  data: OrbitData;
  onAction: (action: OrbitAction) => Promise<void>;
  search?: string;
};

export function ViewModal({ title, description, onClose, children, busy = false }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <dialog ref={ref} className="orbit-modal" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === ref.current && !busy) onClose(); }}>
      <div className="orbit-modal-inner">
        <div className="orbit-modal-heading">
          <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className="muted">{description}</p>}</div>
          <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function MemberAvatar({ profile, small = false }: { profile: Profile; small?: boolean }) {
  return <span className={`avatar secondary-avatar${small ? " secondary-avatar-small" : ""}`} style={{ backgroundColor: profile.color || "#e9e3ff" }} title={profile.name} aria-label={profile.name}>
    {profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
  </span>;
}

export function ActionError({ error }: { error: string }) {
  return error ? <p className="secondary-error" role="alert">{error}</p> : null;
}

export function actionError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export const currency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export function shortDate(date: string) {
  if (!date) return "No due date";
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  return Number.isNaN(parsed.getTime()) ? "No due date" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
