"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { acceptedFiles, fileMime, formatFileSize, maxFileSize, maxPostFiles, reservedFileSchema } from "@/lib/attachments";
import { postJson, postRequest, type Attachment } from "@/lib/post-social";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const demoPreviews=new Set<string>();
export function clearDemoFilePreviews(){for(const url of demoPreviews)URL.revokeObjectURL(url);demoPreviews.clear();}
function demoPreview(file:File){const url=URL.createObjectURL(new Blob([file],{type:fileMime(file.name)}));demoPreviews.add(url);return url;}
export function PostAttachments({ files }: { files: Attachment[] }) {
 const [failures,setFailures]=useState<string[]>([]); const [attempt,setAttempt]=useState(0);
 if (!files.length) return null;
 return <div className="post-attachments">{files.map(file=>{
  const path=file.previewUrl || `/api/attachments/${encodeURIComponent(file.id)}`;
  const image=file.mime.startsWith("image/");
  return <div key={file.id} className={`post-file${image ? " post-photo" : ""}`}>
   {image && (failures.includes(file.id) ? <div className="post-photo-failed"><span>Photo could not load.</span><button className="text-button" onClick={()=>{setFailures(current=>current.filter(id=>id!==file.id));setAttempt(value=>value+1);}}><RotateCcw size={13}/>Try again</button></div> : <a href={path} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${file.name}`}><img loading="lazy" src={path+(file.previewUrl ? "" : `?view=${attempt}`)} alt={file.name} onError={()=>setFailures(current=>[...current,file.id])}/></a>)}
   <a className="post-file-link" href={file.previewUrl || `${path}?download=1`} download={file.name} target="_blank" rel="noopener noreferrer">{image ? <Download size={16}/> : <FileText size={20}/>}<span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span><Download size={14}/></a>
  </div>;
 })}</div>;
}
export function AttachmentPicker({ files,onChange,demo,disabled,onBusy }: {
 files: Attachment[]; onChange: (files:Attachment[])=>void; demo:boolean; disabled:boolean; onBusy:(busy:boolean)=>void;
}) {
 const input=useRef<HTMLInputElement>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function select(event:ChangeEvent<HTMLInputElement>) {
  const selected=Array.from(event.target.files ?? []); event.target.value=""; if (!selected.length) return;
  setError("");
  if (files.length+selected.length>maxPostFiles) {setError("Attach up to 4 files per post.");return;}
  for(const file of selected)if (!fileMime(file.name)||!file.size||file.size>maxFileSize) {setError(!fileMime(file.name) ? "Choose a photo, PDF, Office document, text file, CSV, or ZIP." : "Each file must be between 1 byte and 5 MB.");return;}
  setBusy(true);onBusy(true);let next=[...files];
  try {
   for(const file of selected) {
    const id=crypto.randomUUID(); let attachment:Attachment;
    if (demo) attachment={id,name:file.name,size:file.size,mime:fileMime(file.name),previewUrl:demoPreview(file)};
    else {
     const reserved=reservedFileSchema.parse(await postRequest("/api/attachments",postJson({id,name:file.name,size:file.size})));
     const client=getSupabaseBrowserClient(); if (!client) throw new Error("Please sign in to attach files.");
     const {error:uploadError}=await client.storage.from("orbit-post-files").upload(reserved.path,new Blob([file],{type:reserved.mime}),{contentType:reserved.mime,upsert:false,cacheControl:"60"});
     if(uploadError) {void fetch(`/api/attachments/${id}`,{method:"DELETE"}).catch(()=>{});throw new Error("The file could not upload. Please try attaching it again.");}
     attachment={id,name:reserved.name,size:reserved.size,mime:reserved.mime};
    }
    if(!mounted.current){if(!demo)void fetch(`/api/attachments/${id}`,{method:"DELETE"}).catch(()=>{});else URL.revokeObjectURL(attachment.previewUrl!);break;}
    next=[...next,attachment];onChange(next);
   }
  } catch(cause) {if(mounted.current)setError(cause instanceof Error?cause.message:"The file could not upload.");}
  finally {if(mounted.current){setBusy(false);onBusy(false);}}
 }
 async function remove(file:Attachment) {
  setBusy(true);onBusy(true);setError("");
  try {
   if(!demo)await postRequest(`/api/attachments/${file.id}`,{method:"DELETE"});
   if(file.previewUrl)URL.revokeObjectURL(file.previewUrl);
   if(mounted.current)onChange(files.filter(item=>item.id!==file.id));
  }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Could not remove this file.");}
  finally{if(mounted.current){setBusy(false);onBusy(false);}}
 }
 return <div className="attachment-picker"><input ref={input} type="file" accept={acceptedFiles} multiple hidden aria-hidden="true" tabIndex={-1} disabled={disabled||busy} onChange={event=>{void select(event);}}/>
  {files.length>0&&<ul className="draft-attachments">{files.map(file=><li key={file.id}><FileText size={15}/><span>{file.name}<small>{formatFileSize(file.size)}</small></span><button type="button" className="icon-button" disabled={disabled||busy} aria-label={`Remove attachment ${file.name}`} onClick={()=>{void remove(file);}}><X size={15}/></button></li>)}</ul>}
  <div className="attachment-picker-tools"><button type="button" className="text-button" disabled={disabled||busy||files.length>=maxPostFiles} onClick={()=>input.current?.click()}><Paperclip size={15}/>{busy?"Uploading…":"Attach photos or files"}</button><small>Up to 4 files · 5 MB each</small></div>
  {busy&&<span className="sr-only" role="status">Uploading attachment…</span>}{error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
