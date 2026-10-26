"use client";
import { createContext,useContext,useEffect,useId,useMemo,useRef,useState,type ReactNode } from "react";
import { MoreHorizontal,Trash2 } from "lucide-react";
import { ViewModal } from "./secondary-shared";
import "./content-actions.css";
export type ContentKind="post"|"club_post"|"event";
export type ContentTarget={kind:ContentKind;id:string};
export const contentKey=(kind:ContentKind,id:string)=>`${kind}:${id}`;
type Actions={viewerId:string;deleted:ReadonlySet<string>;remove:(target:ContentTarget)=>Promise<void>};
const ContentActions=createContext<Actions|null>(null);
export const useContentActions=()=>useContext(ContentActions);
export function ContentActionsProvider({viewerId,remove,notify,children}:{viewerId:string;remove:(target:ContentTarget)=>Promise<{cleanupPending?:boolean}>;notify:(message:string)=>void;children:ReactNode}) {
 const [deleted,setDeleted]=useState<ReadonlySet<string>>(()=>new Set());
 const value=useMemo<Actions>(()=>({viewerId,deleted,remove:async target=>{
  const result=await remove(target);setDeleted(current=>new Set([...current,contentKey(target.kind,target.id)]));
  notify(`${target.kind==="event"?"Event":"Post"} deleted.${result.cleanupPending&&target.kind!=="event"?" File cleanup is pending and will retry automatically.":""}`);
 }}),[viewerId,deleted,remove,notify]);
 return <ContentActions.Provider value={value}>{children}</ContentActions.Provider>;
}
export function DeleteContentMenu({kind,id,allowed}:{kind:ContentKind;id:string;allowed:boolean}) {
 const actions=useContentActions(),menuId=useId();const [open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState("");
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),item=useRef<HTMLButtonElement>(null),busy=useRef(false);
 const noun=kind==="event"?"Event":"Post";
 useEffect(()=>{if(!open)return;item.current?.focus();const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
 if(!actions||!allowed)return null;
 function cancel(){if(busy.current)return;setConfirm(false);setError("");setTimeout(()=>trigger.current?.focus(),0);}
 async function erase(){if(busy.current||!actions)return;busy.current=true;setPending(true);setError("");try{await actions.remove({kind,id});setConfirm(false);}catch(cause){setError(cause instanceof Error?cause.message:`The ${noun.toLowerCase()} could not be deleted. Try again.`);}finally{busy.current=false;setPending(false);}}
 return <div className="content-action-menu" ref={root} onClick={event=>event.stopPropagation()}><button type="button" ref={trigger} className="content-menu-trigger" aria-label={`${noun} actions`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><MoreHorizontal size={19}/></button>
 {open&&<div className="content-menu-options" id={menuId} role="menu" aria-label={`${noun} actions`}><button type="button" ref={item} role="menuitem" className="content-danger" onClick={()=>{setOpen(false);setConfirm(true);setError("");}}><Trash2 size={15}/>Delete {noun}</button></div>}
 {confirm&&<ViewModal title={`Delete this ${noun.toLowerCase()}?`} busy={pending} onClose={cancel}><p className="content-delete-copy">This permanently deletes your {noun.toLowerCase()}{kind==="event"?" and its RSVP responses":", comments, likes, and attached files"}. This cannot be undone.</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="secondary-form-actions"><button type="button" className="btn btn-secondary" disabled={pending} onClick={cancel}>Cancel</button><button type="button" className="btn btn-danger" disabled={pending} onClick={()=>{void erase();}}>{pending?"Deleting…":"Delete"}</button></div></ViewModal>}
 </div>;
}
