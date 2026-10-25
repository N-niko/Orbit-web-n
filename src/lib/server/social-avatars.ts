import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET } from "@/lib/account";
/** Sign only the avatar paths approved by the RPC, then remove paths from the response. */
export async function socialAvatars(client:SupabaseClient,value:unknown) {
 if(!value||typeof value!=="object")return value;
 const data=value as Record<string,unknown>;
 const people:Record<string,unknown>[]=[];
 const add=(p:unknown)=>{if(p&&typeof p==="object")people.push(p as Record<string,unknown>);};
 add(data.profile);
 for(const key of ["comments","parents","messages"])if(Array.isArray(data[key]))for(const item of data[key])add(item?.author);
 if(data.updatedComment&&typeof data.updatedComment==="object")add((data.updatedComment as Record<string,unknown>).author);
 if(Array.isArray(data.users))data.users.forEach(add);
 const paths=[...new Set(people.map(p=>p.avatarPath).filter((p):p is string=>typeof p==="string"&&Boolean(p)))];
 const urls=paths.length?(await client.storage.from(AVATAR_BUCKET).createSignedUrls(paths,3600)).data:null;
 const signed=new Map(urls?.filter(p=>p.path&&p.signedUrl).map(p=>[p.path!,p.signedUrl]));
 for(const person of people){if(typeof person.avatarPath==="string"&&signed.has(person.avatarPath))person.avatarUrl=signed.get(person.avatarPath);delete person.avatarPath;}
 return value;
}
