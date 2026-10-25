"use client";
import { useEffect,useRef,useState,type Dispatch,type SetStateAction } from "react";
import { Check,Plus,Users } from "lucide-react";
import { postJson,postRequest,type SocialPerson } from "@/lib/post-social";
import { demoFollowStats,followStatsSchema,peoplePageSchema,setUserFollow,type FollowEdge,type FollowStats } from "@/lib/social";
import { MemberAvatar,ViewModal } from "./secondary-shared";
import "./social-post.css";

export function PeopleDialog({title,path,demoUsers,onClose,onOpenProfile}:{title:string;path?:string;demoUsers?:SocialPerson[];onClose:()=>void;onOpenProfile:(person:SocialPerson)=>void}) {
 const [users,setUsers]=useState<SocialPerson[]>(demoUsers??[]);const [hasMore,setHasMore]=useState(false);const [loading,setLoading]=useState(!demoUsers);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(demoUsers){setUsers(demoUsers);setLoading(false);return;}if(!path)return;
  const controller=new AbortController();setLoading(true);setError("");
  void postRequest(path,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){const page=peoplePageSchema.parse(value);setUsers(page.users);setHasMore(page.hasMore);}}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"People could not load.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[path,demoUsers,retry]);
 async function more(){if(!path||!users.length)return;setLoading(true);setError("");try{const page=peoplePageSchema.parse(await postRequest(`${path}${path.includes("?")?"&":"?"}after=${encodeURIComponent(users.at(-1)!.id)}`));if(mounted.current){setUsers(current=>[...new Map([...current,...page.users].map(p=>[p.id,p])).values()]);setHasMore(page.hasMore);}}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"People could not load.");}finally{if(mounted.current)setLoading(false);}}
 return <ViewModal title={title} onClose={onClose}><div className="social-people-list">{users.map(person=><button className="social-person" key={person.id} onClick={()=>{onClose();onOpenProfile(person);}}><MemberAvatar profile={{university:"",major:"",year:"",bio:"",...person}}/><span><strong>{person.name}</strong>{person.university&&<small>{person.university}</small>}</span></button>)}{loading&&<p className="muted" role="status">Loading people…</p>}{!loading&&!users.length&&!error&&<p className="muted">No students to show yet.</p>}{error&&<div className="social-post-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>}{hasMore&&<button className="text-button" disabled={loading} onClick={()=>{void more();}}>Show more</button>}</div></ViewModal>;
}
export type ConnectionsProps={viewerId:string;demo:boolean;demoEdges:FollowEdge[];onDemoChange:Dispatch<SetStateAction<FollowEdge[]>>;people:SocialPerson[];onOpenProfile:(person:SocialPerson)=>void};
export function ProfileConnections({profile,viewerId,demo,demoEdges,onDemoChange,people,onOpenProfile}:ConnectionsProps&{profile:SocialPerson}) {
 const [stored,setStored]=useState<FollowStats|null>(null);const [loading,setLoading]=useState(!demo);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [list,setList]=useState<"followers"|"following"|null>(null);const [retry,setRetry]=useState(0);const busyRef=useRef(false);const version=useRef(0);
 const path=`/api/profiles/${encodeURIComponent(profile.id)}/social`;const own=profile.id===viewerId;
 const stats=demo?demoFollowStats(demoEdges,viewerId,profile.id):stored;
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();setLoading(true);
  async function load(){if(busyRef.current)return;const current=version.current;try{const value=followStatsSchema.parse(await postRequest(path,{signal:controller.signal}));if(!controller.signal.aborted&&current===version.current){setStored(value);setError("");}}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Connections could not load.");}finally{if(!controller.signal.aborted)setLoading(false);}}
  void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);return()=>{controller.abort();clearInterval(timer);};
 },[path,demo,retry]);
 async function follow(){if(!stats||busyRef.current)return;busyRef.current=true;version.current+=1;setBusy(true);setError("");try{if(demo)onDemoChange(current=>setUserFollow(current,viewerId,profile.id,!stats.following));else setStored(followStatsSchema.parse(await postRequest(path,postJson({following:!stats.following}))));}catch(cause){setError(cause instanceof Error?cause.message:"Following could not update.");}finally{busyRef.current=false;setBusy(false);}}
 const ids=list?demoEdges.filter(e=>list==="followers"?e.followedId===profile.id:e.followerId===profile.id).map(e=>list==="followers"?e.followerId:e.followedId):[];
 return <section className="panel profile-connections" aria-label={`${profile.name} connections`}><div className="profile-connection-actions"><Users size={18}/><button disabled={loading||!stats} onClick={()=>setList("followers")}><strong>{stats?.followerCount??"…"}</strong> Followers</button><button disabled={loading||!stats} onClick={()=>setList("following")}><strong>{stats?.followingCount??"…"}</strong> Following</button>{!own&&<button className={`btn ${stats?.following?"btn-secondary":"btn-primary"}`} aria-pressed={stats?.following??false} disabled={loading||busy||!stats} onClick={()=>{void follow();}}>{stats?.following?<Check size={15}/>:<Plus size={15}/>} {busy?"Saving…":stats?.following?"Following":"Follow"}</button>}</div>{error&&<div className="social-post-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>}{list&&<PeopleDialog title={list==="followers"?"Followers":"Following"} path={`${path}?kind=${list}`} demoUsers={demo?people.filter(p=>ids.includes(p.id)):undefined} onClose={()=>setList(null)} onOpenProfile={onOpenProfile}/>}</section>;
}
