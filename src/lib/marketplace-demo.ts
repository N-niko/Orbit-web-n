import type { Profile } from "./types";
import { filterMarketDemo, type MarketAction, type MarketConversation, type MarketListing, type MarketMessage } from "./marketplace";
export type DemoMarket = { listings: MarketListing[]; conversations: MarketConversation[]; messages: Record<string, MarketMessage[]> };
function illustration(shape: string, color: string) {
 return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450"><rect width="600" height="450" fill="${color}"/><ellipse cx="300" cy="363" rx="160" ry="16" fill="#302d3b" opacity=".08"/>${shape}</svg>`)}`;
}
export function createDemoMarket(): DemoMarket {
 const pictures = [
  illustration('<rect x="186" y="85" width="205" height="266" rx="12" fill="#6c5b91"/><path d="M215 85v266" stroke="#a08abb" stroke-width="8"/><text x="250" y="180" font-family="sans-serif" font-size="24" fill="white">BIOLOGY</text><circle cx="296" cy="256" r="41" fill="none" stroke="#c8d8bb" stroke-width="5"/><path d="M260 240l70 30m-70 0l70-30" stroke="#c8d8bb" stroke-width="4"/>', '#eee8f6'),
  illustration('<path d="M240 355h135m-67 0V193l-47-56" stroke="#5d6859" stroke-width="17" stroke-linecap="round"/><path d="M218 118q-44 34-53 84l120-41q-30-41-67-43" fill="#a3b696"/><path d="M167 204l115-40" stroke="#d3dcbf" stroke-width="10"/>', '#edf0e5'),
  illustration('<rect x="206" y="66" width="186" height="300" rx="22" fill="#444656"/><rect x="228" y="92" width="142" height="94" rx="5" fill="#bfccb2"/><g fill="#858393">'+Array.from({length:20},(_,i)=>`<rect x="${229+i%4*35}" y="${212+Math.floor(i/4)*27}" width="23" height="16" rx="4"/>`).join('')+'</g>', '#e6edf3'),
  illustration('<rect x="173" y="120" width="255" height="24" rx="7" fill="#b99472"/><path d="M193 144v195m216-195v195" stroke="#a47e60" stroke-width="15"/><rect x="220" y="190" width="165" height="70" rx="8" fill="#e2c8a3"/><path d="M243 190v70m112-70v70" stroke="#c6a47f" stroke-width="4"/>', '#f5eadb'),
 ];
 const people = [{id:"maya",name:"Maya Patel",color:"#f8e1d3"},{id:"alex",name:"Alex Morgan",color:"#e9e3ff"},{id:"jordan",name:"Jordan Lee",color:"#e0eafa"},{id:"sam",name:"Sam Rivera",color:"#e2ecd9"}];
 const entries = [
  {title:"Biology textbook · 12th edition",description:"Clean pages and no highlighting. Used for introductory biology. Happy to meet at the library between classes.",category:"Textbooks & Course Materials",price:2500,course:"BIO 101",edition:"12th"},
  {title:"A little light for your desk",description:"Warm light desk lamp in great condition. Passing it along to someone who could use it for late study nights.",category:"Dorm & Furniture",price:1200},
  {title:"TI-84 graphing calculator",description:"Works perfectly and includes the cover. Batteries included. Ready for your next statistics class.",category:"Electronics",price:4000},
  {title:"Free wooden shelf",description:"Small wooden shelf, perfect for books or plants. A few marks from use, but sturdy and ready for a new home.",category:"Free Stuff",price:0},
 ];
 const listings:MarketListing[]=entries.map((e,i)=>({id:`b1000000-0000-4000-8000-00000000000${i+1}`,kind:"sale",title:e.title,description:e.description,category:e.category as MarketListing["category"],price:e.price,condition:i===3?"Fair":"Good",pickup:i===2?"Near Campus":"On Campus",area:i===2?"Bloomfield Avenue cafés":"Library entrance",availability:i===1?"On campus today":"Weekdays",textbook:{course:e.course||"",isbn:"",edition:e.edition||""},status:"available",owner:people[i],university:"Caldwell University",saved:false,createdAt:new Date(Date.now()-i*3600000).toISOString(),photos:[{id:`b2000000-0000-4000-8000-00000000000${i+1}`,name:`demo-${i+1}.svg`,mime:"image/svg+xml",size:1000,previewUrl:pictures[i]}]}));
 listings.push({...listings[0],id:"b1000000-0000-4000-8000-000000000005",kind:"wanted",title:"Looking for an art supply kit",description:"Starting a drawing class next term. Looking for pencils, charcoal, and a sketchbook in usable condition.",category:"School Supplies",price:2000,condition:null,pickup:null,area:"",availability:null,textbook:{course:"",isbn:"",edition:""},status:"active",owner:people[3],photos:[]});
 return {listings,conversations:[],messages:{}};
}
export function applyDemoMarket(state:DemoMarket,action:MarketAction,profile:Profile):{state:DemoMarket;result:unknown} {
 const listing = "id" in action ? state.listings.find(l=>l.id===action.id) : undefined;
 if(action.type==="identity")return {state,result:{eligible:true,university:profile.university,domain:"caldwell.edu"}};
 if(action.type==="browse"){const all=filterMarketDemo(state.listings,action,profile.id);return{state,result:{listings:all.slice(action.offset,action.offset+24),hasMore:all.length>action.offset+24}};}
 if(action.type==="publish") {
  const old=state.listings.find(l=>l.id===action.listing.id); if(old&&old.owner.id!==profile.id)throw new Error("That listing belongs to someone else.");
  const {photoIds,textbook,...input}=action.listing;
  const photos=photoIds.map(id=>state.listings.flatMap(l=>l.photos).find(p=>p.id===id)).filter((p):p is MarketListing["photos"][number]=>Boolean(p));
  const next:MarketListing={...input,textbook,photos,owner:{id:profile.id,name:profile.name,color:profile.color},university:profile.university,saved:old?.saved||false,createdAt:old?.createdAt||new Date().toISOString()};
  return {state:{...state,listings:[next,...state.listings.filter(l=>l.id!==next.id)]},result:next};
 }
 if(action.type==="conversations")return{state,result:{conversations:state.conversations.slice(action.offset,action.offset+30),hasMore:state.conversations.length>action.offset+30}};
 if(action.type==="messages") {const messages=state.messages[action.id]||[];return{state,result:{messages,hasMore:false}};}
 if(action.type==="send") {const messages=state.messages[action.id]||[];return {state:{...state,messages:{...state.messages,[action.id]:messages.some(m=>m.id===action.messageId)?messages:[...messages,{id:action.messageId,authorId:profile.id,body:action.body,createdAt:new Date().toISOString()}]}},result:{ok:true}};}
 if(!listing)throw new Error("Listing not found.");
 if(action.type==="detail")return{state,result:listing};
 if(action.type==="delete"){if(listing.owner.id!==profile.id)throw new Error("That listing belongs to someone else.");return{state:{...state,listings:state.listings.filter(l=>l.id!==listing.id),conversations:state.conversations.map(c=>c.listingId===listing.id?{...c,removed:true}:c)},result:{ok:true}};}
 if(action.type==="save")return{state:{...state,listings:state.listings.map(l=>l.id===listing.id?{...l,saved:action.saved}:l)},result:{ok:true}};
 if(action.type==="contact") {const old=state.conversations.find(c=>c.listingId===listing.id);if(old)return{state,result:{id:old.id}};const c:MarketConversation={id:crypto.randomUUID(),listingId:listing.id,title:listing.title,other:listing.owner,removed:false,updatedAt:new Date().toISOString()};return{state:{...state,conversations:[c,...state.conversations]},result:{id:c.id}};}
 return{state,result:{ok:true}};
}
