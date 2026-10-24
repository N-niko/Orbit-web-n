"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, MessageCircle, Send } from "lucide-react";
import { postJson, postRequest, postThreadSchema, type Attachment, type PostResponse, type PostThread } from "@/lib/post-social";
import type { Profile } from "@/lib/types";
import { MemberAvatar } from "./secondary-shared";
import { PostAttachments } from "./post-attachments";
import "./social-post.css";
export type PostSummary={id:string;author:Pick<Profile,"id"|"name"|"color">;body:string;createdAt:string;category?:string;likeCount:number;liked:boolean;commentCount:number;attachments:Attachment[]};
export function SocialPost({post,club=false,onOpenProfile,demoThread,onDemoRespond,onChanged}: {
 post:PostSummary;club?:boolean;onChanged?:()=>void;onOpenProfile?:()=>void;demoThread?:PostThread;onDemoRespond?:(action:PostResponse)=>Promise<PostThread>;
}) {
 const [stats,setStats]=useState({likeCount:post.likeCount,liked:post.liked,commentCount:post.commentCount});
 const [thread,setThread]=useState<PostThread|null>(demoThread??null); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);
 const [copied,setCopied]=useState(false);
 const [draft,setDraft]=useState("");const [error,setError]=useState("");const requestId=useRef<{body:string;id:string}|null>(null);const mounted=useRef(true);
 const path=`/api/posts/${post.id}/engagement?club=${club}`;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setStats({likeCount:post.likeCount,liked:post.liked,commentCount:post.commentCount});},[post.likeCount,post.liked,post.commentCount]);
 useEffect(()=>{if(demoThread)setThread(demoThread);},[demoThread]);
 async function load(older=false,refresh=false) {
  if(demoThread){setThread(demoThread);return;}setLoading(true);setError("");
  try{
   const value=postThreadSchema.parse(await postRequest(path+(older&&thread?.comments.length?`&before=${thread.comments[0].id}`:"")));
   if(!mounted.current)return;
   setThread(current=>{
    if(!current)return value;
    if(older)return {...value,comments:[...new Map([...value.comments,...current.comments].map(comment=>[comment.id,comment])).values()]};
    if(refresh&&(!value.comments.length||value.comments.some(item=>current.comments.some(previous=>previous.id===item.id))))return {...value,hasMore:current.hasMore,comments:[...new Map([...current.comments,...value.comments].map(comment=>[comment.id,comment])).values()]};
    return value;
   });
   setStats(value);
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Comments could not load.");}
  finally{if(mounted.current)setLoading(false);}
 }
 useEffect(()=>{
  if(!open||demoThread)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible"&&!busy)void load(false,true);},15000);
  return()=>clearInterval(timer);
 },[open,path,demoThread,busy]);
 async function respond(action:PostResponse) {
  if(busy)return;setBusy(true);setError("");
  try{
   const value=onDemoRespond?await onDemoRespond(action):postThreadSchema.parse(await postRequest(path,postJson(action)));
   onChanged?.();
   if(!mounted.current)return;
   setStats(value);setThread(value);
   if(action.type==="comment"){setDraft("");requestId.current=null;}
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Your response could not save.");}
  finally{if(mounted.current)setBusy(false);}
 }
 return <article className="panel social-post" aria-label={`Post by ${post.author.name}`}><header className="social-post-heading"><MemberAvatar profile={{...post.author,university:"",major:"",year:"",bio:""}}/><div>{onOpenProfile?<button className="post-author-link" onClick={onOpenProfile}>{post.author.name}</button>:<strong>{post.author.name}</strong>}<time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></div>{post.category&&<span className="social-post-category">{post.category==="marketplace"?"Marketplace":post.category==="question"?"Question":"Update"}</span>}</header>
  {post.body&&<p className="social-post-body">{post.body}</p>}<PostAttachments files={post.attachments}/>
  <div className="social-post-actions"><button className={stats.liked?"liked":""} disabled={busy} aria-pressed={stats.liked} onClick={()=>{void respond({type:"like",liked:!stats.liked});}}><Heart size={17} fill={stats.liked?"currentColor":"none"}/>{stats.likeCount>0&&stats.likeCount}<span>{stats.liked?"Liked":"Like"}</span></button><button aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}><MessageCircle size={17}/>{stats.commentCount>0&&stats.commentCount}<span>{stats.commentCount===1?"Comment":"Comments"}</span></button><button onClick={()=>{void navigator.clipboard.writeText(`${post.author.name} on Orbit: ${post.body || post.attachments.map(file=>file.name).join(", ")}`).then(()=>setCopied(true)).catch(()=>setError("Copy is unavailable in this browser."));}}><ArrowUpRight size={16}/><span>{copied?"Copied":"Copy"}</span></button></div>
  {error&&<div className="social-post-error" role="alert"><p>{error}</p>{open&&!thread&&<button className="text-button" onClick={()=>{void load();}}>Try again</button>}</div>}
  {open&&<section className="social-comments" aria-label={`Comments on ${post.author.name}’s post`}>
   {loading&&<p className="muted" role="status">Loading comments…</p>}{thread?.hasMore&&<button className="text-button" disabled={loading} onClick={()=>{void load(true);}}>Load earlier comments</button>}
   {!loading&&thread?.comments.length===0&&<p className="social-comment-empty">Be the first to leave a comment.</p>}
   {thread?.comments.map(comment=><article className="social-comment" key={comment.id}><MemberAvatar small profile={{...comment.author,university:"",major:"",year:"",bio:""}}/><div><header><strong>{comment.author.name}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></header><p>{comment.body}</p></div></article>)}
   <form className="social-comment-form" onSubmit={event=>{event.preventDefault();const body=draft.trim();if(!body)return;if(requestId.current?.body!==body)requestId.current={id:crypto.randomUUID(),body};void respond({type:"comment",...requestId.current});}}><label className="sr-only" htmlFor={`reply-${post.id}`}>Comment on {post.author.name}’s post</label><textarea id={`reply-${post.id}`} placeholder="Write a comment…" maxLength={1000} rows={2} disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)}/><button type="submit" className="btn btn-primary" disabled={busy||loading||!draft.trim()}><Send size={15}/>{busy?"Saving…":"Comment"}</button></form>
  </section>}
 </article>;
}
