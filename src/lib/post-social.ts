import { z } from "zod";
export const attachmentSchema = z.object({ id: z.string(), name: z.string(), mime: z.string(), size: z.number().int().positive(), previewUrl: z.string().optional() });
export type Attachment = z.infer<typeof attachmentSchema>;
export const postAuthorSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });
export const postCommentSchema = z.object({ id: z.string(), author: postAuthorSchema, body: z.string(), createdAt: z.string() });
export const postStatsSchema = z.object({ likeCount: z.number().int().nonnegative(), liked: z.boolean(), commentCount: z.number().int().nonnegative(), attachments: z.array(attachmentSchema).max(4) });
export const postThreadSchema = postStatsSchema.extend({ comments: z.array(postCommentSchema).max(20), hasMore: z.boolean() });
export type PostThread = z.infer<typeof postThreadSchema>;
export type PostComment = z.infer<typeof postCommentSchema>;
export const postResponseSchema = z.discriminatedUnion("type", [
 z.object({ type: z.literal("like"), liked: z.boolean() }).strict(),
 z.object({ type: z.literal("comment"), id: z.uuid(), body: z.string().trim().min(1).max(1000) }).strict(),
]);
export type PostResponse = z.infer<typeof postResponseSchema>;
export function threadFromPost(post: { likes: string[]; comments: PostComment[]; attachments?: Attachment[] }, userId: string): PostThread {
 return { likeCount: post.likes.length, liked: post.likes.includes(userId), commentCount: post.comments.length, comments: post.comments.map(comment=>({...comment,author:{id:comment.author.id,name:comment.author.name,color:comment.author.color}})), hasMore: false, attachments: post.attachments ?? [] };
}
export function applyPostResponse<T extends { likes: string[]; comments: PostComment[] }>(post: T, user: z.infer<typeof postAuthorSchema>, action: PostResponse): T {
 if (action.type === "like") return { ...post, likes: action.liked ? [...new Set([...post.likes,user.id])] : post.likes.filter(id=>id!==user.id) };
 if (post.comments.some(comment=>comment.id===action.id)) return post;
 return { ...post, comments: [...post.comments,{ id: action.id, author: user, body: action.body.trim(), createdAt: new Date().toISOString() }] };
}
export async function postRequest(path: string, init?: RequestInit) {
 const response=await fetch(path,{ ...init, cache: "no-store" });
 const value=await response.json().catch(()=>({ error: "The post could not load. Please try again." }));
 if (!response.ok) throw new Error(value.error || "The post could not load. Please try again.");
 return value;
}
export const postJson = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
