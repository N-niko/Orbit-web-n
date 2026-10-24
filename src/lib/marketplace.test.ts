import { describe, expect, it } from "vitest";
import { createDemoMarket, applyDemoMarket } from "./marketplace-demo";
import { createDemoData } from "./demo";
import { defaultMarketFilters, filterMarketDemo, listingInputSchema, marketActionSchema, marketMessagesSchema, marketPrice } from "./marketplace";
const state=createDemoMarket();const profile=createDemoData().profile;
const valid={id:crypto.randomUUID(),kind:"sale",title:"A useful textbook",description:"A clean textbook ready for another student.",category:"Other",price:1000,condition:"Good",pickup:"On Campus",area:"Library entrance",availability:null,textbook:{course:"",isbn:"",edition:""},photoIds:[crypto.randomUUID()],status:"available",rulesAccepted:true};
describe("Marketplace validation",()=>{
 it("requires complete sales, consent, photos, and a public area",()=>{
  expect(listingInputSchema.safeParse(valid).success).toBe(true);
  for(const change of [{price:-1},{price:1.5},{photoIds:[]},{photoIds:[valid.photoIds[0],valid.photoIds[0]]},{area:""},{rulesAccepted:false},{status:"active"},{ownerId:profile.id},{university:"Caldwell University"}])expect(listingInputSchema.safeParse({...valid,...change}).success).toBe(false);
 });
 it("supports free items and wanted requests without photos or budgets",()=>{
  expect(listingInputSchema.safeParse({...valid,category:"Free Stuff"}).success).toBe(false);
  expect(listingInputSchema.safeParse({...valid,category:"Free Stuff",price:0}).success).toBe(true);
  expect(listingInputSchema.safeParse({...valid,kind:"wanted",status:"active",price:null,condition:null,pickup:null,photoIds:[]}).success).toBe(true);
 });
 it("keeps course fields specific to textbooks and caps message bodies",()=>{
  expect(listingInputSchema.safeParse({...valid,textbook:{course:"BIO 101",isbn:"",edition:""}}).success).toBe(false);
  expect(marketActionSchema.safeParse({type:"send",id:valid.id,messageId:crypto.randomUUID(),body:"x".repeat(2001)}).success).toBe(false);
  expect(marketActionSchema.safeParse({...defaultMarketFilters,min:2000,max:1000}).success).toBe(false);
 });
});
describe("Marketplace demo",()=>{
 it("finds descriptions, combines pickup filters, and sorts numeric prices",()=>{
  expect(filterMarketDemo(state.listings,{...defaultMarketFilters,q:"statistics"},profile.id)[0].title).toContain("TI-84");
  expect(filterMarketDemo(state.listings,{...defaultMarketFilters,pickup:"On Campus",availability:"On campus today",max:1500},profile.id)).toHaveLength(1);
  expect(filterMarketDemo(state.listings,{...defaultMarketFilters,sort:"price_low"},profile.id).map(l=>l.price)).toEqual([0,1200,2500,4000]);
 });
 it("isolates wanted and personal sections and saves immutably",()=>{
  expect(filterMarketDemo(state.listings,{...defaultMarketFilters,kind:"wanted"},profile.id)).toHaveLength(1);
  expect(filterMarketDemo(state.listings,{...defaultMarketFilters,section:"mine"},profile.id)).toHaveLength(1);
  const next=applyDemoMarket(state,{type:"save",id:state.listings[0].id,saved:true},profile).state;
  expect(filterMarketDemo(next.listings,{...defaultMarketFilters,section:"saved"},profile.id)).toHaveLength(1);
  expect(state.listings[0].saved).toBe(false);
 });
 it("preserves listing-specific inquiries and idempotent message retries",()=>{
  const contacted=applyDemoMarket(state,{type:"contact",id:state.listings[0].id},profile);
  const id=(contacted.result as {id:string}).id;
  const send={type:"send",id,messageId:crypto.randomUUID(),body:"Is this available?"} as const;
  const next=applyDemoMarket(contacted.state,send,profile).state;
  expect(applyDemoMarket(next,send,profile).state.messages[id]).toHaveLength(1);
  expect(marketMessagesSchema.safeParse(applyDemoMarket(next,{type:"messages",id,before:null},profile).result).success).toBe(true);
  expect(state.conversations).toHaveLength(0);
 });
 it("formats money and open budgets",()=>{expect(marketPrice(0)).toBe("Free");expect(marketPrice(null,true)).toBe("Budget open");expect(marketPrice(1250)).toBe("$12.50");});
});
