import { describe,it,expect,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentActionsProvider } from "./content-actions";
import { SocialPost } from "./social-post";
import { EventCard } from "./events";
import { createDemoData,applyDemoAction } from "@/lib/demo";
import { orbitActionSchema } from "@/lib/server/validation";
const data=createDemoData();const own=data.posts.find(p=>p.author.id===data.profile.id)!,other=data.posts.find(p=>p.author.id!==data.profile.id)!;
const card=(post:typeof own)=><SocialPost post={{...post,likeCount:0,liked:false,commentCount:0,attachments:[]}}/>;
const wrap=(child:React.ReactNode)=>renderToStaticMarkup(<ContentActionsProvider viewerId={data.profile.id} remove={vi.fn()} notify={vi.fn()}>{child}</ContentActionsProvider>);
describe("owner deletion controls",()=>{
 it("shows post actions only to the author across shared post cards",()=>{expect(wrap(card(own))).toContain('aria-label="Post actions"');expect(wrap(card(other))).not.toContain('aria-label="Post actions"');expect(renderToStaticMarkup(card(own))).not.toContain('aria-label="Post actions"');});
 it("respects the database-provided club event permission",()=>{const event={...data.events.find(e=>e.host===data.profile.id)!,canDelete:false};expect(wrap(<EventCard event={event} userId={data.profile.id} onAction={vi.fn()}/>)).not.toContain('aria-label="Event actions"');expect(wrap(<EventCard event={{...event,canDelete:true}} userId={data.profile.id} onAction={vi.fn()}/>)).toContain('aria-label="Event actions"');});
 it("deletes owned demo content idempotently and rejects someone else's content",()=>{const next=applyDemoAction(data,{type:"delete_post",id:own.id});expect(next.posts.some(p=>p.id===own.id)).toBe(false);expect(applyDemoAction(next,{type:"delete_post",id:own.id}).posts).toEqual(next.posts);expect(()=>applyDemoAction(data,{type:"delete_post",id:other.id})).toThrow("author");const event=data.events.find(e=>e.host===data.profile.id)!;expect(applyDemoAction(data,{type:"delete_event",id:event.id}).events.some(e=>e.id===event.id)).toBe(false);expect(()=>applyDemoAction(data,{type:"delete_event",id:data.events[0].id})).toThrow("owner");});
 it("rejects forged actors, invalid IDs, and malformed deletion scopes",()=>{const id="c0000000-0000-4000-8000-000000000020";expect(orbitActionSchema.safeParse({type:"delete_post",id,club:false}).success).toBe(true);for(const action of [{type:"delete_post",id,userId:id},{type:"delete_event",id,host:id},{type:"delete_post",id,club:"true"},{type:"delete_event",id:"invalid"}])expect(orbitActionSchema.safeParse(action).success).toBe(false);});
});
