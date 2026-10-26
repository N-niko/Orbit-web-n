"use client";

import { Children,isValidElement,useEffect,useId,useRef,useState,type KeyboardEvent,type SelectHTMLAttributes,type ReactElement,type OptionHTMLAttributes } from "react";
import { Check,ChevronDown } from "lucide-react";
import "./orbit-select.css";

type Option={value:string;label:string;disabled:boolean};
type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,"multiple"|"size"|"aria-label">&{"aria-label":string};
export function selectPosition(rect:{left:number;top:number;bottom:number;width:number},viewport:{width:number;height:number},count:number,height=count*40+12) {
 const gap=6,pad=10,width=Math.min(Math.max(rect.width,180),viewport.width-pad*2);
 const below=viewport.height-rect.bottom-gap-pad,above=rect.top-gap-pad,up=below<Math.min(height,280)&&above>below;
 const maxHeight=Math.max(40,Math.min(280,up?above:below));
 return {left:Math.max(pad,Math.min(rect.left,viewport.width-width-pad)),top:up?Math.max(pad,rect.top-gap-Math.min(height,maxHeight)):rect.bottom+gap,width,maxHeight};
}
export function nextSelectOption(options:readonly Pick<Option,"disabled">[],current:number,direction:number) {
 for(let offset=1;offset<=options.length;offset++){const index=(current+direction*offset+options.length)%options.length;if(!options[index].disabled)return index;}
 return -1;
}

/** Custom presentation; the native select remains the source of form/change/validation behavior. */
export function OrbitSelect({children,value,defaultValue,onChange,onInvalid,className,"aria-label":label,...props}:Props) {
 const options=Children.toArray(children).filter(isValidElement).map(child=>{
  const option=(child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>).props;
  const text=Children.toArray(option.children).join("");return {value:String(option.value??text),label:option.label??text,disabled:Boolean(option.disabled)};
 });
 const [uncontrolled,setUncontrolled]=useState(()=>String(defaultValue??options[0]?.value??""));
 const selected=options.findIndex(option=>option.value===String(value??uncontrolled)),chosen=options[selected]??options[0];
 const [enhanced,setEnhanced]=useState(false),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[invalid,setInvalid]=useState(false);
 const native=useRef<HTMLSelectElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLSpanElement>(null),search=useRef({text:"",at:0});const id=useId();
 useEffect(()=>{setEnhanced(typeof HTMLElement.prototype.showPopover==="function");},[]);
 function close(){if(enhanced&&menu.current?.matches(":popover-open"))menu.current.hidePopover();setOpen(false);search.current.text="";}
 function place(){if(trigger.current&&menu.current)Object.assign(menu.current.style,Object.fromEntries(Object.entries(selectPosition(trigger.current.getBoundingClientRect(),{width:document.documentElement.clientWidth,height:window.innerHeight},options.length,menu.current.scrollHeight||undefined)).map(([key,v])=>[key,`${v}px`])));}
 function show(index=selected>=0?selected:nextSelectOption(options,-1,1)) {
  if(!enhanced||trigger.current?.matches(":disabled")||!options.some(option=>!option.disabled))return;
  place();menu.current?.showPopover();place();setActive(index);setOpen(true);
 }
 function choose(index:number){const option=options[index],select=native.current;if(!option||option.disabled||!select||select.matches(":disabled"))return;close();trigger.current?.focus();if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));}}
 useEffect(()=>{
  if(!open)return;
  const reposition=()=>place();window.addEventListener("resize",reposition);window.addEventListener("scroll",reposition,true);
  const observer=new ResizeObserver(reposition);if(trigger.current)observer.observe(trigger.current);
  return()=>{window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true);observer.disconnect();};
 },[open,options.length]);
 useEffect(()=>{if(open)menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:"nearest"});},[active,open]);
 useEffect(()=>{if(open&&trigger.current?.matches(":disabled"))close();});
 useEffect(()=>{
  const form=native.current?.form;if(!form)return;const reset=()=>{setUncontrolled(String(defaultValue??options[0]?.value??""));setInvalid(false);close();};form.addEventListener("reset",reset);return()=>form.removeEventListener("reset",reset);
 });
 function keyDown(event:KeyboardEvent<HTMLButtonElement>){
  const key=event.key;
  if(key==="Escape"&&open){event.preventDefault();event.stopPropagation();close();return;}
  if(key==="Tab"){if(open)choose(active);return;}
  if(["ArrowDown","ArrowUp","Home","End"].includes(key)){
   event.preventDefault();const direction=key==="ArrowUp"||key==="End"?-1:1;
   const index=key==="Home"?nextSelectOption(options,-1,1):key==="End"?nextSelectOption(options,0,-1):open?nextSelectOption(options,active,direction):selected>=0?selected:nextSelectOption(options,direction>0?-1:0,direction);
   if(open)setActive(index);else show(index);return;
  }
  if(key==="Enter"||key===" "){event.preventDefault();if(open)choose(active);else show();return;}
  if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   event.preventDefault();const text=key.toLocaleLowerCase(),now=Date.now(),previous=now-search.current.at<700?search.current.text:"";
   search.current={text:previous+text,at:now};const query=[...search.current.text].every(letter=>letter===text)?text:search.current.text;
   const start=query.length===1?(open?active:selected)+1:(open?active:selected);
   for(let offset=0;offset<options.length;offset++){const index=(Math.max(0,start)+offset)%options.length;if(!options[index].disabled&&options[index].label.toLocaleLowerCase().startsWith(query)){if(open)setActive(index);else show(index);break;}}
  }
 }
 return <span className={`orbit-select${className?` ${className}`:""}`} data-enhanced={enhanced||undefined}>
  <select {...props} ref={native} value={value} defaultValue={defaultValue} className="orbit-select-native" aria-label={label} aria-hidden={enhanced||undefined} tabIndex={enhanced?-1:props.tabIndex} onFocus={event=>{props.onFocus?.(event);if(enhanced)trigger.current?.focus();}} onChange={event=>{setUncontrolled(event.currentTarget.value);setInvalid(!event.currentTarget.validity.valid);onChange?.(event);}} onInvalid={event=>{onInvalid?.(event);if(enhanced){event.preventDefault();setInvalid(true);trigger.current?.focus();show();}}}>{children}</select>
  <button ref={trigger} type="button" hidden={!enhanced} className="orbit-select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} aria-required={props.required||undefined} aria-describedby={[props["aria-describedby"],invalid?`${id}-error`:null].filter(Boolean).join(" ")||undefined} aria-invalid={props["aria-invalid"]??(invalid||undefined)} disabled={props.disabled} tabIndex={props.tabIndex} onKeyDown={keyDown} onClick={()=>{if(open)close();else show();}} onBlur={close}><span>{chosen?.label??""}</span><ChevronDown size={15} aria-hidden="true"/></button>
  <span ref={menu} hidden={!enhanced} id={`${id}-list`} className="orbit-select-menu" role="listbox" aria-label={label} popover="auto" onToggle={event=>{if(event.newState==="closed"){setOpen(false);search.current.text="";}}} onMouseDown={event=>event.preventDefault()} onClick={event=>event.stopPropagation()}>
   {options.map((option,index)=><span key={option.value} id={`${id}-${index}`} role="option" aria-selected={chosen?.value===option.value} aria-disabled={option.disabled||undefined} className={`orbit-select-option${active===index?" is-active":""}`} data-index={index} onPointerMove={()=>{if(!option.disabled)setActive(index);}} onClick={()=>choose(index)}><span>{option.label}</span>{chosen?.value===option.value&&<Check size={15} aria-hidden="true"/>}</span>)}
  </span>
  {enhanced&&invalid&&<span id={`${id}-error`} className="orbit-select-error" role="alert">Choose an option.</span>}
 </span>;
}
