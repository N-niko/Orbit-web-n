import { z } from "zod";
import { attachmentSchema, postAuthorSchema } from "./post-social";

export const marketCategories = ["Textbooks & Course Materials", "Electronics", "Dorm & Furniture", "Clothing & Accessories", "School Supplies", "Sports & Hobbies", "Free Stuff", "Other"] as const;
export const marketConditions = ["New", "Like new", "Good", "Fair"] as const;
export const marketPickup = ["On Campus", "Near Campus", "Flexible"] as const;
export const marketAvailability = ["On campus today", "Weekdays", "Weekends", "Flexible schedule"] as const;
export const marketStatuses = ["available", "reserved", "sold", "active", "fulfilled"] as const;
export const marketRules = "No weapons, drugs, alcohol, tobacco, stolen goods, recalled items, animals, account sales, or academic cheating services. Meet in a public campus location.";
export const marketPhotoBucket = "orbit-market-photos";
const money = z.number().int().min(0).max(100000000);
const textbook = z.object({ course: z.string().trim().max(40), isbn: z.string().trim().max(24), edition: z.string().trim().max(40) }).strict();
export const listingInputSchema = z.object({
 id: z.uuid(), kind: z.enum(["sale", "wanted"]), title: z.string().trim().min(3).max(100),
 description: z.string().trim().min(10).max(3000), category: z.enum(marketCategories),
 price: money.nullable(), condition: z.enum(marketConditions).nullable(), pickup: z.enum(marketPickup).nullable(),
 area: z.string().trim().max(100), availability: z.enum(marketAvailability).nullable(),
 textbook, photoIds: z.array(z.uuid()).max(4), status: z.enum(marketStatuses), rulesAccepted: z.literal(true),
}).strict().superRefine((value, ctx) => {
 if (new Set(value.photoIds).size !== value.photoIds.length) ctx.addIssue({ code: "custom", message: "Choose each photo once." });
 if (value.kind === "sale" && (value.price === null || !value.condition || !value.pickup || !value.photoIds.length || !["available", "reserved", "sold"].includes(value.status))) ctx.addIssue({ code: "custom", message: "Add a photo, price, condition, pickup preference, and item status." });
 if (value.kind === "wanted" && !["active", "fulfilled"].includes(value.status)) ctx.addIssue({ code: "custom", message: "Choose an active or fulfilled request." });
 if (value.kind === "sale" && value.category === "Free Stuff" && value.price !== 0) ctx.addIssue({ code: "custom", message: "Free Stuff listings must be free." });
 if (value.kind === "sale" && value.pickup !== "Flexible" && !value.area) ctx.addIssue({ code: "custom", message: "Add a public meeting place or general area." });
 if (value.category !== marketCategories[0] && Object.values(value.textbook).some(Boolean)) ctx.addIssue({ code: "custom", message: "Course details are only for textbooks." });
});
export type ListingInput = z.infer<typeof listingInputSchema>;
export const marketFiltersSchema = z.object({
 type: z.literal("browse"), kind: z.enum(["sale", "wanted"]), section: z.enum(["browse", "saved", "mine"]),
 q: z.string().trim().max(100), category: z.enum(marketCategories).nullable(),
 min: money.nullable(), max: money.nullable(), condition: z.enum(marketConditions).nullable(), pickup: z.enum(marketPickup).nullable(),
 availability: z.enum(marketAvailability).nullable(), sort: z.enum(["newest", "price_low", "price_high"]), offset: z.number().int().min(0).max(10000),
}).strict().refine(v => v.min === null || v.max === null || v.min <= v.max, "Minimum price must be below the maximum.");
export type MarketFilters = z.infer<typeof marketFiltersSchema>;
export const defaultMarketFilters: MarketFilters = { type: "browse", kind: "sale", section: "browse", q: "", category: null, min: null, max: null, condition: null, pickup: null, availability: null, sort: "newest", offset: 0 };
export const marketActionSchema = z.union([
 marketFiltersSchema, z.object({ type: z.literal("identity") }).strict(),
 z.object({ type: z.literal("detail"), id: z.uuid() }).strict(),
 z.object({ type: z.literal("publish"), listing: listingInputSchema }).strict(),
 z.object({ type: z.literal("delete"), id: z.uuid() }).strict(),
 z.object({ type: z.literal("save"), id: z.uuid(), saved: z.boolean() }).strict(),
 z.object({ type: z.literal("contact"), id: z.uuid() }).strict(),
 z.object({ type: z.literal("conversations"), offset: z.number().int().min(0).max(10000) }).strict(),
 z.object({ type: z.literal("messages"), id: z.uuid(), before: z.uuid().nullable() }).strict(),
 z.object({ type: z.literal("send"), id: z.uuid(), messageId: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict(),
 z.object({ type: z.literal("report"), id: z.uuid(), reason: z.enum(["Prohibited item", "Suspected scam", "Inappropriate content", "Other"]), detail: z.string().trim().max(500) }).strict(),
]);
export type MarketAction = z.infer<typeof marketActionSchema>;
export const marketIdentitySchema = z.object({ eligible: z.boolean(), university: z.string().nullable(), domain: z.string() });
export type MarketIdentity = z.infer<typeof marketIdentitySchema>;
export const marketListingSchema = z.object({
 id: z.uuid(), kind: z.enum(["sale", "wanted"]), title: z.string(), description: z.string(), category: z.enum(marketCategories),
 price: money.nullable(), condition: z.enum(marketConditions).nullable(), pickup: z.enum(marketPickup).nullable(), area: z.string(),
 availability: z.enum(marketAvailability).nullable(), textbook, status: z.enum(marketStatuses),
 owner: postAuthorSchema, university: z.string(), photos: z.array(attachmentSchema).max(4), saved: z.boolean(), createdAt: z.string(),
});
export type MarketListing = z.infer<typeof marketListingSchema>;
export const marketPageSchema = z.object({ listings: z.array(marketListingSchema).max(24), hasMore: z.boolean() });
export const marketConversationSchema = z.object({ id: z.uuid(), listingId: z.uuid(), title: z.string(), other: postAuthorSchema, updatedAt: z.string(), removed: z.boolean() });
export type MarketConversation = z.infer<typeof marketConversationSchema>;
export const marketConversationsSchema = z.object({ conversations: z.array(marketConversationSchema).max(30), hasMore: z.boolean() });
export const marketMessageSchema = z.object({ id: z.uuid(), authorId: z.string(), body: z.string(), createdAt: z.string() });
export type MarketMessage = z.infer<typeof marketMessageSchema>;
export const marketMessagesSchema = z.object({ messages: z.array(marketMessageSchema).max(50), hasMore: z.boolean() });
export function marketPrice(cents: number | null, wanted = false) { return cents === null ? "Budget open" : cents === 0 ? "Free" : `${wanted ? "Up to " : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100)}`; }
export function marketPhotoUrl(photo: MarketListing["photos"][number]) { return photo.previewUrl || `/api/marketplace/photos/${encodeURIComponent(photo.id)}`; }
export function filterMarketDemo(listings: MarketListing[], filters: MarketFilters, userId: string) {
 const q = filters.q.toLowerCase();
 return listings.filter(l => l.kind === filters.kind && (filters.section === "mine" ? l.owner.id === userId : filters.section === "saved" || !["sold", "fulfilled"].includes(l.status)) &&
  (filters.section !== "saved" || l.saved) && (!q || `${l.title} ${l.description}`.toLowerCase().includes(q)) &&
  (!filters.category || l.category === filters.category) && (!filters.condition || l.condition === filters.condition) &&
  (!filters.pickup || l.pickup === filters.pickup) && (!filters.availability || l.availability === filters.availability) &&
  (filters.min === null || (l.price !== null && l.price >= filters.min)) && (filters.max === null || (l.price !== null && l.price <= filters.max)))
 .sort((a,b) => filters.sort === "newest" ? b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id) : (a.price === null ? 1 : b.price === null ? -1 : (a.price-b.price)*(filters.sort === "price_low" ? 1 : -1)) || b.createdAt.localeCompare(a.createdAt));
}
