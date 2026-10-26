"use client";
import { OrbitSelect } from "./orbit-select";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check, CheckCheck, CheckSquare2, ClipboardList, Copy, Home, Plus, Receipt, ShoppingBasket, Trash2, Users, Wallet } from "lucide-react";
import type { OrbitAction } from "@/lib/types";
import { ActionError, actionError, currency, MemberAvatar, shortDate, ViewModal, type ViewProps } from "./secondary-shared";
import "./secondary.css";

type Tab = "task" | "grocery" | "expense";
type Modal = Tab | "space" | null;

export function RoommatesView({ data, onAction, search = "" }: ViewProps) {
  const [tab, setTab] = useState<Tab>("task");
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [copied, setCopied] = useState(false);
  const [spaceMode, setSpaceMode] = useState<"join" | "create">("join");
  const { workspace, profile, tasks, expenses } = data;
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const members = workspace.members;
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const complete = tasks.filter((task) => task.completed && task.kind === "task").length;
  const allTasks = tasks.filter((task) => task.kind === "task");
  const visibleTasks = tasks.filter((task) => task.kind === tab && `${task.title} ${members.find((member) => member.id === task.assignee)?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const visibleExpenses = expenses.filter((expense) => expense.title.toLowerCase().includes(search.toLowerCase()));

  async function run(action: OrbitAction, key: string, close = false) {
    setError(""); setPending(key);
    try { await onAction(action); if (close) setModal(null); }
    catch (cause) { setError(actionError(cause)); }
    finally { setPending(""); }
  }

  function openModal(next: Modal) { setError(""); setModal(next); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (modal === "expense") {
      const amount = Number(form.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) { setError("Enter an amount greater than zero."); return; }
      await run({ type: "create_expense", title: String(form.get("title")).trim(), amount, paidBy: String(form.get("paidBy")) }, "form", true);
    } else if (modal === "task" || modal === "grocery") {
      await run({ type: "create_task", title: String(form.get("title")).trim(), assignee: String(form.get("assignee")), dueDate: String(form.get("dueDate") || ""), kind: modal }, "form", true);
    } else if (modal === "space") {
      const value = String(form.get("space")).trim();
      await run(spaceMode === "join" ? { type: "join_workspace", code: value.toUpperCase() } : { type: "create_workspace", name: value }, "form", true);
    }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(workspace.inviteCode); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError("Copy is unavailable. Select the invite code to share it."); }
  }

  return <div className="secondary-view roommates-view">
    <div className="view-heading"><div><p className="eyebrow">BETTER TOGETHER</p><h1>Roommate life, organized.</h1><p className="muted">A shared space for the people you call home.</p></div><button className="btn btn-secondary" onClick={() => openModal("space")}><Users size={17} /> Manage space</button></div>

    <section className="roommate-home panel">
      <div className="roommate-home-icon"><Home size={28} strokeWidth={1.6} /></div>
      <div className="roommate-home-info"><p className="eyebrow">YOUR LITTLE CORNER</p><h2>{workspace.name}</h2><p className="muted">Good roommates. Better routines.</p></div>
      <div className="roommate-home-members"><div className="secondary-avatar-stack">{members.slice(0, 5).map((member) => <MemberAvatar key={member.id} profile={member} />)}</div><span>{members.length} {members.length === 1 ? "roommate" : "roommates"}</span></div>
      <button type="button" className="roommate-invite" onClick={copyInvite} aria-label={`Copy invite code ${workspace.inviteCode}`}><span>INVITE CODE</span><strong>{workspace.inviteCode}</strong>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
    </section>

    <div className="secondary-stats">
      <div className="panel secondary-stat"><span className="secondary-stat-icon lavender"><CheckCheck size={20} /></span><div><p>Household wins</p><strong>{complete}<small> / {allTasks.length} tasks done</small></strong></div></div>
      <div className="panel secondary-stat"><span className="secondary-stat-icon peach"><ShoppingBasket size={20} /></span><div><p>On the grocery list</p><strong>{tasks.filter((task) => task.kind === "grocery" && !task.completed).length}<small> items to pick up</small></strong></div></div>
      <div className="panel secondary-stat"><span className="secondary-stat-icon mint"><Wallet size={20} /></span><div><p>Shared expenses</p><strong>{currency(total)}<small> recorded</small></strong></div></div>
    </div>

    <div className="roommate-content">
      <section className="panel roommate-board">
        <div className="secondary-tabs" aria-label="Household lists">
          <button className={tab === "task" ? "active" : ""} onClick={() => setTab("task")} aria-pressed={tab === "task"}><CheckSquare2 size={17} /> Tasks</button>
          <button className={tab === "grocery" ? "active" : ""} onClick={() => setTab("grocery")} aria-pressed={tab === "grocery"}><ShoppingBasket size={17} /> Groceries</button>
          <button className={tab === "expense" ? "active" : ""} onClick={() => setTab("expense")} aria-pressed={tab === "expense"}><Receipt size={17} /> Expenses</button>
        </div>
        <div className="roommate-board-heading"><div><h2>{tab === "task" ? "Everyone does their bit" : tab === "grocery" ? "The essentials, all in one list" : "Keep the little things fair"}</h2><p className="muted">{tab === "task" ? "Less reminding. More getting things done." : tab === "grocery" ? "Check it off when it lands in the cart." : "Track shared spending and split it equally."}</p></div><button className="btn btn-primary" onClick={() => openModal(tab)}><Plus size={16} />{tab === "task" ? "Add task" : tab === "grocery" ? "Add item" : "Add expense"}</button></div>
        {!modal && <ActionError error={error} />}
        {tab !== "expense" ? <div className="roommate-task-list">{visibleTasks.length ? visibleTasks.map((task) => {
          const assignee = members.find((member) => member.id === task.assignee);
          return <div className={`roommate-task${task.completed ? " is-complete" : ""}`} key={task.id}>
            <button className="roommate-checkbox" aria-label={`${task.completed ? "Mark incomplete" : "Complete"}: ${task.title}`} aria-pressed={task.completed} disabled={Boolean(pending)} onClick={() => run({ type: "toggle_task", id: task.id }, task.id)}>{task.completed && <Check size={15} />}</button>
            <div className="roommate-task-copy"><strong>{task.title}</strong><span>{task.dueDate ? `Due ${shortDate(task.dueDate)}` : tab === "grocery" ? "On the shopping list" : "No due date"}</span></div>
            {assignee && <span className="roommate-assignee"><MemberAvatar profile={assignee} small /><span>{assignee.id === profile.id ? "You" : assignee.name.split(" ")[0]}</span></span>}
            <button className="icon-button secondary-delete" aria-label={`Delete ${task.title}`} disabled={Boolean(pending)} onClick={() => run({ type: "delete_task", id: task.id }, task.id)}><Trash2 size={16} /></button>
          </div>;
        }) : <div className="empty-state"><ClipboardList size={30} /><h3>{search ? "No matching items" : "A fresh start for your space"}</h3><p>{search ? "Try another search." : "Add your first item and make home run a little smoother."}</p></div>}</div> : <div className="roommate-task-list">{visibleExpenses.length ? visibleExpenses.map((expense) => <div className="roommate-task" key={expense.id}><span className="roommate-expense-icon"><Receipt size={18} /></span><div className="roommate-task-copy"><strong>{expense.title}</strong><span>{members.find((member) => member.id === expense.paidBy)?.name || "Roommate"} paid · {shortDate(expense.createdAt)}</span></div><strong className="roommate-expense-amount">{currency(expense.amount)}</strong><button className="icon-button secondary-delete" aria-label={`Delete expense ${expense.title}`} disabled={Boolean(pending)} onClick={() => run({ type: "delete_expense", id: expense.id }, expense.id)}><Trash2 size={16} /></button></div>) : <div className="empty-state"><Receipt size={30} /><h3>No expenses yet</h3><p>Groceries, utilities, or your next pizza night. Keep track here.</p></div>}</div>}
      </section>

      <aside className="roommate-side">
        <section className="panel roommate-members"><div className="secondary-section-heading"><h2>Your people</h2><span className="badge">{members.length}</span></div>{members.map((member) => <div key={member.id} className="roommate-member"><MemberAvatar profile={member} /><div><strong>{member.name}{member.id === profile.id ? " (you)" : ""}</strong><span>{member.major || "Orbit roommate"}</span></div></div>)}<button className="roommate-text-button" onClick={copyInvite}>{copied ? "Invite code copied" : "Invite a roommate"}<ArrowUpRight size={15} /></button></section>
        <section className="panel roommate-balances"><span className="secondary-stat-icon mint"><Wallet size={20} /></span><h2>All fair and square</h2><p className="muted">An equal split across {members.length} {members.length === 1 ? "roommate" : "roommates"}.</p><div className="roommate-split-total"><span>Each person’s share</span><strong>{currency(total / Math.max(members.length, 1))}</strong></div>{members.map((member) => { const balance = expenses.filter((expense) => expense.paidBy === member.id).reduce((sum, expense) => sum + expense.amount, 0) - total / Math.max(members.length, 1); return <div className="roommate-balance-row" key={member.id}><span>{member.id === profile.id ? "You" : member.name.split(" ")[0]}</span><strong className={balance >= 0 ? "positive" : ""}>{Math.abs(balance) < 0.005 ? "Even" : balance > 0 ? `Gets ${currency(balance)}` : `Owes ${currency(-balance)}`}</strong></div>; })}<p className="roommate-ledger-note">A spending record for your household. Settle up directly with each other.</p></section>
      </aside>
    </div>

    {modal && <ViewModal title={modal === "space" ? "Find your home in Orbit" : modal === "expense" ? "Add a shared expense" : modal === "grocery" ? "Add to the grocery list" : "A little task, a happier home"} description={modal === "space" ? "Join your roommates or create a fresh space together." : modal === "expense" ? "This expense will be split equally among your current roommates." : "Put it on the list and share the load."} onClose={() => setModal(null)} busy={Boolean(pending)}>
      {modal === "space" && <div className="secondary-switch"><button className={spaceMode === "join" ? "active" : ""} onClick={() => { setSpaceMode("join"); setError(""); }}>Join a space</button><button className={spaceMode === "create" ? "active" : ""} onClick={() => { setSpaceMode("create"); setError(""); }}>Create a space</button></div>}
      <form onSubmit={submit} className="secondary-form" key={`${modal}-${spaceMode}`}>
        {modal === "space" ? <label className="field">{spaceMode === "join" ? "Invite code" : "Space name"}<input name="space" required minLength={spaceMode === "join" ? 12 : 2} maxLength={spaceMode === "join" ? 12 : 60} placeholder={spaceMode === "join" ? "Your 12-character invite code" : "e.g. The Willow House"} autoCapitalize={spaceMode === "join" ? "characters" : "sentences"} autoComplete="off" /></label> : <>
          <label className="field">{modal === "expense" ? "What was it for?" : modal === "grocery" ? "What do you need?" : "Task name"}<input name="title" required maxLength={160} placeholder={modal === "expense" ? "e.g. The weekly grocery run" : modal === "grocery" ? "e.g. Oat milk and coffee" : "e.g. Give the kitchen some love"} /></label>
          <div className="form-grid">{modal === "expense" ? <label className="field">Amount (USD)<input name="amount" type="number" required min="0.01" step="0.01" max="100000" placeholder="0.00" /></label> : <label className="field">Due date<input name="dueDate" type="date" required defaultValue={todayString} /></label>}
            <label className="field">{modal === "expense" ? "Paid by" : "Assigned to"}<OrbitSelect aria-label={modal === "expense" ? "Paid by" : "Assigned to"} name={modal === "expense" ? "paidBy" : "assignee"} defaultValue={profile.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.id === profile.id ? " (you)" : ""}</option>)}</OrbitSelect></label></div>
        </>}
        <ActionError error={error} /><div className="secondary-form-actions"><button className="btn btn-secondary" type="button" disabled={Boolean(pending)} onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={Boolean(pending)}>{pending ? "Saving…" : modal === "space" ? spaceMode === "join" ? "Join space" : "Create space" : modal === "expense" ? "Add expense" : modal === "grocery" ? "Add item" : "Add task"}</button></div>
      </form>
    </ViewModal>}
  </div>;
}
