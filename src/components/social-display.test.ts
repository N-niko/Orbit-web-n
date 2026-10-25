import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import { PostAttachments } from "./post-attachments";
import { MemberAvatar } from "./secondary-shared";
describe("social display",()=>{
 it("shows clickable photos without a file metadata/download bar",()=>{
  const html=renderToStaticMarkup(createElement(PostAttachments,{files:[{id:"photo",name:"Landscape.jpg",mime:"image/jpeg",size:3000}]}));
  expect(html).toContain('aria-label="Open photo Landscape.jpg"');expect(html).toContain('<img');expect(html).not.toContain('post-file-link');expect(html).not.toContain('3 KB');expect(html).not.toContain('download=1');
 });
 it("keeps the download link and metadata for documents",()=>{
  const html=renderToStaticMarkup(createElement(PostAttachments,{files:[{id:"document",name:"Notes.pdf",mime:"application/pdf",size:3000}]}));
  expect(html).toContain('post-file-link');expect(html).toContain('download=1');expect(html).toContain('Notes.pdf');expect(html).toContain('3 KB');
 });
 it("gives avatar boxes a square, circular, non-shrinking shape",()=>{
  const html=renderToStaticMarkup(createElement(MemberAvatar,{profile:{id:"a",name:"Alex",color:"#eee",university:"",major:"",year:"",bio:"",avatarUrl:"https://example.test/wide.jpg"}}));
  expect(html).toContain('aspect-ratio:1 / 1');expect(html).toContain('border-radius:50%');expect(html).toContain('flex-shrink:0');expect(html).toContain('overflow:hidden');
 });
});
