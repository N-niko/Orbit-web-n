import { z } from "zod";

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(160);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date");

export const orbitActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update_visibility"), field: z.enum(["major", "year", "bio", "posts"]), visible: z.boolean() }).strict(),
  z.object({ type: z.literal("create_post"), body: z.string().trim().max(3000), audience: z.enum(["public", "followers"]).default("public"), category: z.enum(["general", "question", "marketplace"]).optional(), id: uuid.optional(), attachmentIds: z.array(uuid).max(4).default([]) }).strict(),

  z.object({ type: z.literal("toggle_like"), id: uuid }).strict(),
  z.object({ type: z.literal("add_comment"), id: uuid, body: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ type: z.literal("create_task"), title: shortText, assignee: uuid, dueDate: dateOnly, kind: z.enum(["task", "grocery"]) }).strict(),
  z.object({ type: z.literal("toggle_task"), id: uuid }).strict(),
  z.object({ type: z.literal("delete_task"), id: uuid }).strict(),
  z.object({ type: z.literal("create_expense"), title: shortText, amount: z.number().positive().max(100000).multipleOf(0.01), paidBy: uuid }).strict(),
  z.object({ type: z.literal("delete_expense"), id: uuid }).strict(),
  z.object({ type: z.literal("create_event"), id: uuid.optional(), title: shortText, description: z.string().trim().max(3000), location: shortText, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), category: z.enum(["Social", "Academic", "Clubs", "Wellness"]), cover: z.enum(["violet", "peach", "green", "blue"]) }).strict(),
  z.object({ type: z.literal("edit_event_schedule"), id: uuid, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("toggle_rsvp"), id: uuid }).strict(),
  z.object({ type: z.literal("respond_event"), id: uuid, response: z.enum(["going", "not_going"]) }).strict(),
  z.object({ type: z.literal("remove_event"), id: uuid }).strict(),
  z.object({ type: z.literal("restore_event"), id: uuid }).strict(),
  z.object({ type: z.literal("create_club_event"), id: uuid, clubId: uuid, title: shortText, description: z.string().trim().max(3000), location: shortText, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), cover: z.enum(["violet", "peach", "green", "blue"]) }).strict(),
  z.object({ type: z.literal("update_profile"), name: z.string().trim().min(1).max(80), major: z.string().trim().max(100), year: z.string().trim().max(40), bio: z.string().trim().max(500) }).strict(),
  z.object({ type: z.literal("join_workspace"), code: z.string().trim().regex(/^[a-zA-Z0-9]{12}$/, "Invite codes have 12 letters or numbers").transform((value) => value.toUpperCase()) }).strict(),
  z.object({ type: z.literal("create_workspace"), name: z.string().trim().min(1).max(80) }).strict(),
]).refine(action => action.type !== "create_post" || Boolean(action.body || action.attachmentIds.length), "Write a post or attach a file.")
 .refine(action => !("endsAt" in action) || Date.parse(action.endsAt) > Date.parse(action.startsAt), "End time must be after start time.");

/** Block cross-site cookie-authenticated mutations while permitting local tooling. */
export function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Auth callback destinations must stay on this application. */
export function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  return value;
}
