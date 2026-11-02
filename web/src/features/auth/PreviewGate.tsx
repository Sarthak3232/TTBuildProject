"use client";
import { useSyncExternalStore } from "react";
import { LoginPreview } from "./LoginPreview";
const key="slotty-preview-entered";
function subscribe(callback:()=>void){window.addEventListener("slotty-preview-access",callback);return()=>window.removeEventListener("slotty-preview-access",callback);}
function snapshot(){return sessionStorage.getItem(key)==="yes";}
export function PreviewGate({children}:{children:React.ReactNode}){
 const entered=useSyncExternalStore(subscribe,snapshot,()=>false);
 if(!entered)return <LoginPreview onEnter={()=>{sessionStorage.setItem(key,"yes");window.dispatchEvent(new Event("slotty-preview-access"));}} />;
 return children;
}
