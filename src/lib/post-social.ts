import { z } from "zod";
export const attachmentSchema = z.object({ id: z.string(), name: z.string(), mime: z.string(), size: z.number().int().positive(), previewUrl: z.string().optional() });
export type Attachment = z.infer<typeof attachmentSchema>;
export const postAuthorSchema = z.object({ id: z.string(), name: z.string(), color: z.string(), university: z.string().optional(), avatarUrl: z.string().optional() });
export type SocialPerson = z.infer<typeof postAuthorSchema>;
export const postCommentSchema = z.object({ id: z.string(), author: postAuthorSchema, body: z.string(), createdAt: z.string(), parentId: z.string().nullable().optional(), replyToId: z.string().nullable().optional(), replyToName: z.string().nullable().optional(), likeCount: z.number().int().nonnegative().optional(), liked: z.boolean().optional(), likes: z.array(z.string()).optional() });
export const postStatsSchema = z.object({ likeCount: z.number().int().nonnegative(), liked: z.boolean(), commentCount: z.number().int().nonnegative(), attachments: z.array(attachmentSchema).max(4) });
export const postThreadSchema = postStatsSchema.extend({ comments: z.array(postCommentSchema).max(20), parents: z.array(postCommentSchema).max(20).optional(), updatedComment: postCommentSchema.optional(), likers: z.array(postAuthorSchema).optional(), hasMore: z.boolean() });
export type PostThread = z.infer<typeof postThreadSchema>;
export type PostComment = z.infer<typeof postCommentSchema>;
export const postResponseSchema = z.discriminatedUnion("type", [
 z.object({ type: z.literal("like"), liked: z.boolean() }).strict(),
 z.object({ type: z.literal("comment_like"), id: z.uuid(), liked: z.boolean() }).strict(),
 z.object({ type: z.literal("comment"), id: z.uuid(), body: z.string().trim().min(1).max(1000), replyToId: z.uuid().optional() }).strict(),
]);
export type PostResponse = z.infer<typeof postResponseSchema>;
export function threadFromPost(post: { likes: string[]; comments: PostComment[]; attachments?: Attachment[]; author?: SocialPerson }, userId: string, people: SocialPerson[] = []): PostThread {
 const safe=(person:SocialPerson)=>postAuthorSchema.parse(person);
 const known=new Map([...people,...post.comments.map(c=>c.author),...(post.author?[post.author]:[])].map(person=>[person.id,person]));
 return { likeCount: post.likes.length, liked: post.likes.includes(userId), commentCount: post.comments.length, comments: post.comments.map(comment=>({...comment,author:safe(comment.author),likeCount:comment.likes?.length??comment.likeCount??0,liked:comment.likes?.includes(userId)??comment.liked??false})), likers:post.likes.flatMap(id=>known.has(id)?[safe(known.get(id)!)]:[]), hasMore: false, attachments: post.attachments ?? [] };
}
export function applyPostResponse<T extends { likes: string[]; comments: PostComment[] }>(post: T, user: z.infer<typeof postAuthorSchema>, action: PostResponse): T {
 if (action.type === "like") return { ...post, likes: action.liked ? [...new Set([...post.likes,user.id])] : post.likes.filter(id=>id!==user.id) };
 if (action.type === "comment_like") return {...post,comments:post.comments.map(comment=>comment.id===action.id?{...comment,likes:action.liked?[...new Set([...(comment.likes??[]),user.id])]:(comment.likes??[]).filter(id=>id!==user.id)}:comment)};
 if (post.comments.some(comment=>comment.id===action.id)) return post;
 const target=action.replyToId?post.comments.find(c=>c.id===action.replyToId):undefined;
 if(action.replyToId&&!target)throw new Error("That comment is no longer available.");
 return { ...post, comments: [...post.comments,{ id: action.id, author: user, body: action.body.trim(), createdAt: new Date().toISOString(), parentId:target?.parentId||target?.id||null, replyToId:target?.id||null, replyToName:target?.author.name||null, likes:[] }] };
}
/** Keep loaded history while refreshing reactions and out-of-page parent context. */
export function mergePostThread(current:PostThread|null,incoming:PostThread,mode:"older"|"refresh"|"respond"):PostThread {
 if(!current)return incoming;
 if(mode==="refresh"&&incoming.comments.length&&!incoming.comments.some(c=>current.comments.some(old=>old.id===c.id)))return incoming;
 const comments=new Map([...current.comments,...incoming.comments].map(c=>[c.id,c]));
 for(const parent of incoming.parents??[])if(comments.has(parent.id))comments.set(parent.id,parent);
 const parents=new Map([...(current.parents??[]),...(incoming.parents??[])].map(c=>[c.id,c]));
 if(incoming.updatedComment){const c=incoming.updatedComment;if(comments.has(c.id))comments.set(c.id,c);else if(parents.has(c.id))parents.set(c.id,c);}
 for(const id of comments.keys())parents.delete(id);
 const order=(a:PostComment,b:PostComment)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
 return {...incoming,comments:[...comments.values()].sort(order),parents:[...parents.values()].sort(order),hasMore:mode==="older"?incoming.hasMore:current.hasMore};
}
export function commentThreads(thread:PostThread) {
 const all=[...new Map([...(thread.parents??[]),...thread.comments].map(c=>[c.id,c])).values()];
 return all.filter(c=>!c.parentId).map(root=>({root,replies:all.filter(c=>c.parentId===root.id)}));
}
export async function postRequest(path: string, init?: RequestInit) {
 const response=await fetch(path,{ ...init, cache: "no-store" });
 const value=await response.json().catch(()=>({ error: "The post could not load. Please try again." }));
 if (!response.ok) throw new Error(value.error || "The post could not load. Please try again.");
 return value;
}
export const postJson = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
