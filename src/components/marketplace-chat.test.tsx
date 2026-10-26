import { describe,it,expect,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketInbox } from "./marketplace";
import { createDemoData } from "@/lib/demo";
import { createDemoMarket } from "@/lib/marketplace-demo";
import type { MarketConversation } from "@/lib/marketplace";
const profile=createDemoData().profile;
const conversation:MarketConversation={id:"a0000000-0000-4000-8000-000000000001",listingId:"a0000000-0000-4000-8000-000000000002",title:"Biology book",other:{id:"maya",name:"Maya Patel",color:"#eee"},removed:false,updatedAt:"2026-01-01T00:00:00Z"};
describe("marketplace contact handoff",()=>{
 it("renders the selected chat and composer before inbox results arrive, including an older conversation",()=>{
  const read=vi.fn();const html=renderToStaticMarkup(<MarketInbox profile={profile} initialConversation={conversation} execute={vi.fn()} read={read} onListing={vi.fn()} demoData={createDemoMarket()}/>);
  expect(html).toContain("Chat with Maya Patel");expect(html).toContain('placeholder="Message Maya Patel…"');expect(html).toContain('id="market-message"');expect(html).toContain('autofocus=""');expect(html).toContain('market-inbox-active');expect(read).not.toHaveBeenCalled();
 });
 it("keeps the inbox selection prompt when entering Inquiries without contacting a listing",()=>{
  const html=renderToStaticMarkup(<MarketInbox profile={profile} initialConversation={null} execute={vi.fn()} read={vi.fn()} onListing={vi.fn()} demoData={createDemoMarket()}/>);
  expect(html).toContain("Select an inquiry to read or send a message.");expect(html).not.toContain('id="market-message"');
 });
});
