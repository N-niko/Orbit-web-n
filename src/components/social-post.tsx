"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, MessageCircle, Send, X } from "lucide-react";
import { commentThreads,mergePostThread,postJson,postRequest,postThreadSchema,type Attachment,type PostComment,type PostResponse,type PostThread,type SocialPerson } from "@/lib/post-social";
import { DeleteContentMenu,useContentActions,contentKey } from "./content-actions";
import { MemberAvatar } from "./secondary-shared";
import { PeopleDialog } from "./social-people";
import { PostAttachments } from "./post-attachments";
import "./social-post.css";
export type PostSummary={id:string;author:SocialPerson;body:string;createdAt:string;category?:string;audience?:string;likeCount:number;liked:boolean;commentCount:number;attachments:Attachment[]};
export function SocialPost({post,club=false,onOpenProfile,demoThread,onDemoRespond,onChanged}: {
 post:PostSummary;club?:boolean;onChanged?:()=>void;onOpenProfile?:(person:SocialPerson)=>void;demoThread?:PostThread;onDemoRespond?:(action:PostResponse)=>Promise<PostThread>;
}) {
 const content=useContentActions();
 const [stats,setStats]=useState({likeCount:post.likeCount,liked:post.liked,commentCount:post.commentCount});
 const [thread,setThread]=useState<PostThread|null>(demoThread??null);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [likers,setLikers]=useState(false);
 const [copied,setCopied]=useState(false);const [reply,setReply]=useState<PostComment|null>(null);
 const [draft,setDraft]=useState("");const [error,setError]=useState("");const requestId=useRef<{key:string;id:string}|null>(null);const mounted=useRef(true);const version=useRef(0);const reading=useRef(false);
 const path=`/api/posts/${post.id}/engagement?club=${club}`;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setStats({likeCount:post.likeCount,liked:post.liked,commentCount:post.commentCount});},[post.likeCount,post.liked,post.commentCount]);
 useEffect(()=>{if(demoThread)setThread(demoThread);},[demoThread]);
 async function load(older=false,refresh=false) {
  if(demoThread){setThread(demoThread);return;}if(reading.current)return;reading.current=true;const current=version.current;if(!refresh)setLoading(true);setError("");
  try{
   const value=postThreadSchema.parse(await postRequest(path+(older&&thread?.comments.length?`&before=${thread.comments[0].id}`:"")));
   if(!mounted.current||current!==version.current)return;
   setThread(previous=>older||refresh?mergePostThread(previous,value,older?"older":"refresh"):value);setStats(value);
  }catch(cause){if(mounted.current&&current===version.current)setError(cause instanceof Error?cause.message:"Comments could not load.");}
  finally{reading.current=false;if(mounted.current)setLoading(false);}
 }
 useEffect(()=>{
  if(!open||demoThread)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible"&&!busy)void load(false,true);},15000);
  return()=>clearInterval(timer);
 },[open,path,demoThread,busy]);
 async function respond(action:PostResponse) {
  if(busy)return;version.current+=1;setBusy(true);setError("");
  try{
   const value=onDemoRespond?await onDemoRespond(action):postThreadSchema.parse(await postRequest(path,postJson(action)));
   onChanged?.();if(!mounted.current)return;
   setStats(value);setThread(current=>onDemoRespond?value:mergePostThread(current,value,"respond"));
   if(action.type==="comment"){setDraft("");setReply(null);requestId.current=null;}
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Your response could not save.");}
  finally{if(mounted.current)setBusy(false);}
 }
 function avatar(person:SocialPerson,small=false){const image=<MemberAvatar small={small} profile={{university:"",major:"",year:"",bio:"",...person}}/>;return onOpenProfile?<button className="avatar-link" aria-label={`Open ${person.name}’s profile`} onClick={()=>onOpenProfile(person)}>{image}</button>:image;}
 function name(person:SocialPerson){return onOpenProfile?<button className="post-author-link" onClick={()=>onOpenProfile(person)}>{person.name}</button>:<strong>{person.name}</strong>;}
 function comment(item:PostComment,isReply=false){return <article className={`social-comment${isReply?" social-comment-reply":""}`} key={item.id}>{avatar(item.author,true)}<div><header>{name(item.author)}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></header>{item.replyToName&&<span className="social-reply-context">Reply to {item.replyToName}</span>}<p>{item.body}</p><div className="social-comment-actions"><button aria-label={`${item.liked?"Unlike":"Like"} ${item.author.name}’s comment`} aria-pressed={item.liked??false} className={item.liked?"liked":""} disabled={busy} onClick={()=>{void respond({type:"comment_like",id:item.id,liked:!item.liked});}}><Heart size={13} fill={item.liked?"currentColor":"none"}/><span>{item.likeCount??0}</span><span>{item.liked?"Liked":"Like"}</span></button><button disabled={busy} onClick={()=>{setReply(item);document.getElementById(`reply-${post.id}`)?.focus();}}>Reply</button></div></div></article>;}
 if(content?.deleted.has(contentKey(club?"club_post":"post",post.id)))return null;
 return <article className="panel social-post" aria-label={`Post by ${post.author.name}`}><header className="social-post-heading">{avatar(post.author)}<div>{name(post.author)}<time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></div>{post.audience&&<span className="social-post-category">{post.audience==="followers"?"Followers Only":post.audience==="public"?"Public":"Older post"}</span>}<DeleteContentMenu kind={club?"club_post":"post"} id={post.id} allowed={content?.viewerId===post.author.id}/></header>
  {post.body&&<p className="social-post-body">{post.body}</p>}<PostAttachments files={post.attachments}/>
  <div className="social-post-actions"><div className="social-like-controls"><button className={stats.liked?"liked":""} disabled={busy} aria-pressed={stats.liked} onClick={()=>{void respond({type:"like",liked:!stats.liked});}}><Heart size={17} fill={stats.liked?"currentColor":"none"}/><span>{stats.liked?"Liked":"Like"}</span></button>{stats.likeCount>0&&<button className="social-like-count" aria-label={`Show ${stats.likeCount} ${stats.likeCount===1?"like":"likes"}`} onClick={()=>setLikers(true)}>{stats.likeCount}</button>}</div><button aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}><MessageCircle size={17}/>{stats.commentCount>0&&stats.commentCount}<span>{stats.commentCount===1?"Comment":"Comments"}</span></button><button onClick={()=>{void navigator.clipboard.writeText(`${post.author.name} on Orbit: ${post.body || post.attachments.map(file=>file.name).join(", ")}`).then(()=>setCopied(true)).catch(()=>setError("Copy is unavailable in this browser."));}}><ArrowUpRight size={16}/><span>{copied?"Copied":"Copy"}</span></button></div>
  {error&&<div className="social-post-error" role="alert"><p>{error}</p>{open&&!thread&&<button className="text-button" onClick={()=>{void load();}}>Try again</button>}</div>}
  {open&&<section className="social-comments" aria-label={`Comments on ${post.author.name}’s post`}>
   {loading&&<p className="muted" role="status">Loading comments…</p>}{thread?.hasMore&&<button className="text-button" disabled={loading||busy} onClick={()=>{void load(true);}}>Load earlier comments</button>}
   {!loading&&thread?.comments.length===0&&<p className="social-comment-empty">Be the first to leave a comment.</p>}
   {thread&&commentThreads(thread).map(({root,replies})=><div className="social-comment-thread" key={root.id}>{comment(root)}{replies.length>0&&<div className="social-replies">{replies.map(item=>comment(item,true))}</div>}</div>)}
   {reply&&<div className="social-reply-target"><span>Replying to <strong>{reply.author.name}</strong></span><button className="icon-button" aria-label="Cancel reply" disabled={busy} onClick={()=>setReply(null)}><X size={14}/></button></div>}
   <form className="social-comment-form" onSubmit={event=>{event.preventDefault();const body=draft.trim();if(!body)return;const key=JSON.stringify({body,replyToId:reply?.id});if(requestId.current?.key!==key)requestId.current={id:crypto.randomUUID(),key};void respond({type:"comment",id:requestId.current.id,body,...(reply?{replyToId:reply.id}:{})});}}><label className="sr-only" htmlFor={`reply-${post.id}`}>{reply?`Reply to ${reply.author.name}`:`Comment on ${post.author.name}’s post`}</label><textarea id={`reply-${post.id}`} placeholder={reply?`Reply to ${reply.author.name}…`:"Write a comment…"} maxLength={1000} rows={2} disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)}/><button type="submit" className="btn btn-primary" disabled={busy||loading||!draft.trim()}><Send size={15}/>{busy?"Saving…":reply?"Reply":"Comment"}</button></form>
  </section>}
  {likers&&<PeopleDialog title="Liked by" path={`/api/posts/${post.id}/likes?club=${club}`} demoUsers={demoThread?(thread??demoThread).likers??[]:undefined} onClose={()=>setLikers(false)} onOpenProfile={person=>onOpenProfile?.(person)}/>}
 </article>;
}
