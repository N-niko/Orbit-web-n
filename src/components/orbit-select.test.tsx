import { describe,it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitSelect,nextSelectOption,selectPosition } from "./orbit-select";

describe("Orbit select",()=>{
 it("preserves native names, values, validation and defaults for forms and fallback browsers",()=>{
  const html=renderToStaticMarkup(<OrbitSelect aria-label="Club interest" name="category" defaultValue="Other" required disabled><option>Academic</option><option>Other</option></OrbitSelect>);
  expect(html).toContain('name="category"');expect(html).toContain('required=""');expect(html).toContain('disabled=""');expect(html).toContain('<option selected="">Other</option>');expect(html).toContain('role="combobox"');expect(html).toContain('role="listbox"');expect(html).toContain('aria-label="Club interest"');
 });
 it("keeps controlled option values and exactly one selected listbox item",()=>{
  const html=renderToStaticMarkup(<OrbitSelect aria-label="Audience" value="followers" onChange={()=>{}}><option value="public">Public</option><option value="followers">Followers Only</option></OrbitSelect>);
  expect(html).toContain('<option value="followers" selected="">');expect(html.match(/aria-selected="true"/g)).toHaveLength(1);expect(html).toContain('Followers Only');
 });
 it("wraps keyboard navigation and skips disabled options",()=>{
  const options=[{disabled:false},{disabled:true},{disabled:false}];
  expect(nextSelectOption(options,0,1)).toBe(2);expect(nextSelectOption(options,0,-1)).toBe(2);expect(nextSelectOption(options,2,1)).toBe(0);expect(nextSelectOption([{disabled:true}],0,1)).toBe(-1);expect(nextSelectOption([],-1,1)).toBe(-1);
 });
 it("positions the popup above a low trigger and within phone edges",()=>{
  const result=selectPosition({left:300,top:690,bottom:734,width:140},{width:375,height:800},10,452);
  expect(result.left).toBe(185);expect(result.width).toBe(180);expect(result.maxHeight).toBe(280);expect(result.top+result.maxHeight).toBe(684);
 });
 it("uses available space below a top trigger and fits narrow viewports",()=>{
  const result=selectPosition({left:0,top:20,bottom:64,width:400},{width:320,height:600},3);
  expect(result).toEqual({left:10,top:70,width:300,maxHeight:280});
 });
});
