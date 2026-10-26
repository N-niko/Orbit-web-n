"use client";
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Plus } from "lucide-react";
import type { Profile } from "@/lib/types";
import { clubPostsSchema, mergeClubMessages, type Club, type ClubPost, type DemoClubPost, type DemoClubs } from "@/lib/clubs";
import { applyPostResponse, postJson, postRequest, threadFromPost, type Attachment, type PostResponse, type SocialPerson } from "@/lib/post-social";
import { AttachmentPicker } from "./post-attachments";
import { useContentActions,contentKey } from "./content-actions";
import { SocialPost } from "./social-post";
export function ClubPosts({club,profile,demo,demoData,onDemoChange,onMembershipLost,onRefresh,onOpenProfile,people}: {
 onOpenProfile:(person:SocialPerson)=>void; people:SocialPerson[];
 club:Club;profile:Profile;demo:boolean;demoData:DemoClubs;onDemoChange:Dispatch<SetStateAction<DemoClubs>>;onMembershipLost:()=>void;onRefresh:()=>Promise<void>;
}) {
 const content=useContentActions(),deleted=useRef(content?.deleted);deleted.current=content?.deleted;const lastDeleted=useRef(content?.deleted);
 const [posts,setPosts]=useState<ClubPost[]>([]);const [hasMore,setHasMore]=useState(false);const [ready,setReady]=useState(false);
 const [body,setBody]=useState("");const [files,setFiles]=useState<Attachment[]>([]);const [uploading,setUploading]=useState(false);const [busy,setBusy]=useState(false);const [olderBusy,setOlderBusy]=useState(false);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
 const historyLoaded=useRef(false);const postsRef=useRef(posts);postsRef.current=posts;
 const requestId=useRef<{key:string;id:string}|null>(null);const mounted=useRef(true);const lost=useRef(onMembershipLost);lost.current=onMembershipLost;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(demo){setReady(true);return;}
  if(lastDeleted.current!==content?.deleted){lastDeleted.current=content?.deleted;postsRef.current=[];setPosts([]);historyLoaded.current=false;}
  const controller=new AbortController();let active=false;
  async function refresh(){
   if(active||controller.signal.aborted)return;active=true;
   try{
    const response=await fetch(`/api/clubs/${club.id}/posts`,{cache:"no-store",signal:controller.signal});
    if(response.status===403){setPosts([]);lost.current();return;}
    const value=await response.json();if(!response.ok)throw new Error(value.error||"Club posts could not load.");
    const parsed=clubPostsSchema.parse(value);if(controller.signal.aborted)return;
    const overlap=!postsRef.current.length||parsed.messages.some(post=>postsRef.current.some(item=>item.id===post.id));
    if(!overlap)historyLoaded.current=false;
    setPosts(current=>overlap?mergeClubMessages(current,parsed.messages) as ClubPost[]:parsed.messages);
    if(!historyLoaded.current)setHasMore(parsed.hasMore);setReady(true);setError("");
   }catch(cause){if(!controller.signal.aborted){setReady(true);setError(cause instanceof Error?cause.message:"Club posts could not load.");}}
   finally{active=false;}
  }
  void refresh();const poll=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);
  return()=>{controller.abort();clearInterval(poll);};
 },[club.id,demo,retry,content?.deleted]);
 const shown=(demo?(demoData.posts[club.id]??[]).map(post=>({...post,...threadFromPost(post,profile.id,people)})):posts).filter(post=>!content?.deleted.has(contentKey("club_post",post.id)));
 async function older(){
  if(!posts.length)return;setOlderBusy(true);const currentDeletion=deleted.current;
  try{const parsed=clubPostsSchema.parse(await postRequest(`/api/clubs/${club.id}/posts?before=${posts[0].id}`));if(mounted.current&&deleted.current===currentDeletion){setPosts(current=>mergeClubMessages(current,parsed.messages) as ClubPost[]);historyLoaded.current=true;setHasMore(parsed.hasMore);}}
  catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Older posts could not load.");}finally{if(mounted.current)setOlderBusy(false);}
 }
 async function publish(event:FormEvent){
  event.preventDefault();if(busy||uploading||(!body.trim()&&!files.length))return;
  const key=JSON.stringify({body:body.trim(),files:files.map(file=>file.id)});if(requestId.current?.key!==key)requestId.current={key,id:crypto.randomUUID()};
  const id=requestId.current.id;setBusy(true);setError("");
  try{
   if(demo){const post:DemoClubPost={id,body:body.trim(),createdAt:new Date().toISOString(),author:profile,likes:[],comments:[],attachments:files};onDemoChange(current=>({...current,posts:{...current.posts,[club.id]:mergeClubMessages(current.posts[club.id]??[],[post]) as DemoClubPost[]}}));}
   else{await postRequest(`/api/clubs/${club.id}/posts`,postJson({id,body:body.trim(),attachmentIds:files.map(file=>file.id)}));const parsed=clubPostsSchema.parse(await postRequest(`/api/clubs/${club.id}/posts`));if(mounted.current){setPosts(current=>mergeClubMessages(current,parsed.messages) as ClubPost[]);if(!historyLoaded.current)setHasMore(parsed.hasMore);}}
   if(mounted.current){setBody("");setFiles([]);requestId.current=null;}
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"The post could not save. Your draft is kept.");}finally{if(mounted.current)setBusy(false);}
 }
 async function respondDemo(id:string,action:PostResponse){
  const post=demoData.posts[club.id]?.find(post=>post.id===id);if(!post)throw new Error("Post not found.");
  const next=applyPostResponse(post,profile,action);
  onDemoChange(current=>({...current,posts:{...current.posts,[club.id]:(current.posts[club.id]??[]).map(item=>item.id===id?applyPostResponse(item,profile,action):item)}}));
  return threadFromPost(next,profile.id,people);
 }
 return <section className="club-posts" aria-label={`${club.name} posts`}>
  <form className="panel club-post-composer" onSubmit={event=>{void publish(event);}}><div className="club-posts-heading"><h2>Club posts</h2><small>For followers</small></div><label className="sr-only" htmlFor={`club-post-${club.id}`}>Post to {club.name}</label><textarea id={`club-post-${club.id}`} placeholder="Share an update with your club…" maxLength={3000} rows={3} value={body} disabled={busy} onChange={event=>setBody(event.target.value)}/>
   <AttachmentPicker files={files} onChange={setFiles} demo={demo} disabled={busy} onBusy={setUploading}/><div className="club-post-composer-actions"><small>{body.length}/3000</small><button type="submit" className="btn btn-primary" disabled={busy||uploading||!ready||(!body.trim()&&!files.length)}><Plus size={15}/>{busy?"Publishing…":"Publish post"}</button></div>
  </form>
  {error&&<div className="panel social-post-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>}
  {!ready?<p className="muted" role="status">Loading club posts…</p>:!shown.length&&!error?<section className="panel empty-state"><h3>Start the first post.</h3><p>Share an update, a question, or something worth passing along.</p></section>:[...shown].reverse().map(post=><SocialPost onOpenProfile={onOpenProfile} onChanged={()=>{void onRefresh().catch(()=>{});}} key={post.id} post={post} club demoThread={demo?threadFromPost(demoData.posts[club.id].find(item=>item.id===post.id)!,profile.id,people):undefined} onDemoRespond={demo?action=>respondDemo(post.id,action):undefined}/>)}
  {!demo&&hasMore&&<button className="btn btn-secondary" disabled={olderBusy} onClick={()=>{void older();}}>{olderBusy?"Loading…":"Load earlier posts"}</button>}
 </section>;
}
