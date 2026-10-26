"use client";
import { OrbitSelect } from "./orbit-select";
import { useEffect,useRef,useState } from "react";
import { ArrowDown,ArrowUpRight,MessageCircle } from "lucide-react";
import type { OrbitAction,OrbitData } from "@/lib/types";
import type { FollowEdge } from "@/lib/social";
import { demoFeed,feedPageSchema,mergeFeed,type FeedItem,type FeedPage } from "@/lib/feed";
import { postRequest,threadFromPost,type Attachment,type PostResponse,type PostThread,type SocialPerson } from "@/lib/post-social";
import { AttachmentPicker } from "./post-attachments";
import { MemberAvatar } from "./secondary-shared";
import { useContentActions,contentKey } from "./content-actions";
import { SocialPost } from "./social-post";
import { EventCard } from "./events";
export function Feed({data,onAction,demo,edges,respondDemo,onOpenProfile,onPostChanged,onOpenEvent,onOpenClub}:{data:OrbitData;onAction:(action:OrbitAction)=>Promise<void>;demo:boolean;edges:FollowEdge[];respondDemo:(id:string,action:PostResponse)=>Promise<PostThread>;onOpenProfile:(person:SocialPerson)=>void;onPostChanged:()=>void;onOpenEvent:(id:string)=>void;onOpenClub:(id:string)=>void}) {
 const content=useContentActions();
 const [body,setBody]=useState(""),[audience,setAudience]=useState<"public"|"followers">("public"),[files,setFiles]=useState<Attachment[]>([]),[uploading,setUploading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");const requestId=useRef<{key:string;id:string}|null>(null);
 const [items,setItems]=useState<FeedItem[]>(data.feed?.items??[]),[cursor,setCursor]=useState<FeedPage["nextCursor"]>(data.feed?.nextCursor??null),[hasMore,setHasMore]=useState(data.feed?.hasMore??false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(""),[demoLimit,setDemoLimit]=useState(8);
 const reading=useRef(false),loadedOlder=useRef(false),sentinel=useRef<HTMLDivElement>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{if(!data.feed||demo)return;const page=data.feed;const boundary=page.items.at(-1)?.publishedAt;
 setItems(current=>mergeFeed(boundary?current.filter(item=>item.publishedAt<boundary):[],page.items));
 if(!loadedOlder.current){setCursor(page.nextCursor);setHasMore(page.hasMore);}
 },[data.feed,demo]);
 const allDemo=demo?demoFeed(data,edges):[],visible=(demo?allDemo.slice(0,demoLimit):items).filter(item=>!content?.deleted.has(contentKey(item.kind,item.id))&&(item.kind!=="event"||data.events.some(event=>event.id===item.id))),more=demo?allDemo.length>demoLimit:hasMore;
 async function loadMore(){if(reading.current||!more)return;if(demo){setDemoLimit(v=>v+8);return;}if(!cursor)return;
 reading.current=true;setLoading(true);setLoadError("");const controller=new AbortController();request.current=controller;
 try{const page=feedPageSchema.parse(await postRequest(`/api/feed?${new URLSearchParams({cursor:JSON.stringify(cursor)})}`,{signal:controller.signal}));if(controller.signal.aborted)return;loadedOlder.current=true;setItems(current=>mergeFeed(current,page.items));setCursor(page.nextCursor);setHasMore(page.hasMore);}catch(cause){if(!controller.signal.aborted)setLoadError(cause instanceof Error?cause.message:"The feed could not load.");}finally{reading.current=false;if(!controller.signal.aborted)setLoading(false);}}
 useEffect(()=>{if(!more||loading||loadError||!sentinel.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void loadMore();},{rootMargin:"300px"});observer.observe(sentinel.current);return()=>observer.disconnect();},[more,loading,loadError,cursor,demoLimit,demo]);
 async function publish(){if(busy||uploading||(!body.trim()&&!files.length))return;const key=JSON.stringify({body:body.trim(),audience,files:files.map(f=>f.id)});if(requestId.current?.key!==key)requestId.current={key,id:crypto.randomUUID()};setBusy(true);setError("");try{await onAction({type:"create_post",id:requestId.current.id,body:body.trim(),audience,attachmentIds:files.map(f=>f.id),...(demo?{attachments:files}:{})});setBody("");setFiles([]);requestId.current=null;}catch(cause){setError(cause instanceof Error?cause.message:"Your post could not save.");}finally{setBusy(false);}}
 return <section className="feed-section"><div className="feed-heading"><h2>In the loop <span>✳</span></h2><span>Your campus, all caught up.</span></div><div className="composer panel"><div className="composer-input"><MemberAvatar profile={data.profile}/><textarea aria-label="Write a post" placeholder={`What’s on your mind, ${data.profile.name.split(" ")[0]}?`} value={body} disabled={busy} onChange={event=>setBody(event.target.value)} maxLength={3000} rows={body?3:1}/></div><AttachmentPicker files={files} onChange={setFiles} demo={demo} disabled={busy} onBusy={setUploading}/>{error&&<p className="form-error" role="alert">{error}</p>}<div className="composer-bottom"><label className="post-audience">Audience<OrbitSelect aria-label="Post audience" value={audience} disabled={busy} onChange={e=>setAudience(e.target.value as typeof audience)}><option value="public">Public</option><option value="followers">Followers Only</option></OrbitSelect></label><button className="btn btn-primary post-button" disabled={busy||uploading||(!body.trim()&&!files.length)} onClick={()=>{void publish();}}>{busy?"Posting…":"Post"}<ArrowUpRight size={15}/></button></div><small className="post-audience-note">{audience==="public"?"All signed-in Orbit students can see this post.":"Only you and students who follow you can see this post."}</small></div><div className="feed-filters"><span><ArrowDown size={13}/>Latest first</span></div>
 <div className="posts">{visible.map(item=>item.kind==="event"?<EventCard key={`event:${item.id}`} event={data.events.find(e=>e.id===item.id)??item.event} userId={data.profile.id} onAction={onAction} onOpenEvent={onOpenEvent} onOpenClub={onOpenClub}/>:<SocialPost key={`post:${item.id}`} post={item.post} onOpenProfile={onOpenProfile} onChanged={onPostChanged} demoThread={demo?threadFromPost(data.posts.find(p=>p.id===item.id)!,data.profile.id,data.workspace.members):undefined} onDemoRespond={demo?action=>respondDemo(item.id,action):undefined}/>)}{!visible.length&&<div className="empty-state panel"><MessageCircle size={32}/><h3>Good conversations start somewhere.</h3><p>Share an update or say a little hello.</p></div>}</div>
 {loadError&&<p className="form-error" role="alert">{loadError}</p>}{more&&<div className="feed-load-more" ref={sentinel}><button className="btn btn-secondary" disabled={loading} onClick={()=>{void loadMore();}}>{loading?"Loading…":loadError?"Try again":"Load more"}</button></div>}
 </section>;
}
