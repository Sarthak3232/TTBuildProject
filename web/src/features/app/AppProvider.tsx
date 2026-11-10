"use client";
import { createContext,useCallback,useContext,useEffect,useRef,useState } from "react";
import type { Activity,AppData,Completion } from "@/domain/activity";
import { activeMilliseconds } from "@/domain/activity";
import { api,mutation } from "./client";
type Control="pause"|"resume"|"complete"|"cancel";
type Context={data:AppData|null;activity:Activity|null;elapsedMs:number;online:boolean;busy:boolean;error:string;refresh:()=>Promise<void>;startTask:(taskId:string)=>Promise<Activity>;controlSession:(action:Control,options?:{reflection?:string;description?:string})=>Promise<{activity:Activity;completion:Completion|null;balance:number}>};
const AppContext=createContext<Context|null>(null);
export function AppProvider({children}:{children:React.ReactNode}){
 const[data,setData]=useState<AppData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[online,setOnline]=useState(true),[now,setNow]=useState(0);
 const offset=useRef(0);const mutationBusy=useRef(false);const retry=useRef<{signature:string;key:string}|null>(null);
 const refresh=useCallback(async()=>{try{const result=await api<AppData>("/api/app");offset.current=Date.parse(result.serverTime)-Date.now();setData(result);setError("")}catch(e){setError((e as Error).message);throw e}},[]);
 useEffect(()=>{void refresh().catch(()=>{});const timer=setInterval(()=>setNow(Date.now()),1000);const poll=setInterval(()=>{if(navigator.onLine)void refresh().catch(()=>{})},15000);const status=()=>setOnline(navigator.onLine);const focus=()=>{status();void refresh().catch(()=>{})};status();window.addEventListener("online",focus);window.addEventListener("offline",status);window.addEventListener("focus",focus);return()=>{clearInterval(timer);clearInterval(poll);window.removeEventListener("online",focus);window.removeEventListener("offline",status);window.removeEventListener("focus",focus)}},[refresh]);
 async function perform<T>(path:string,payload:Record<string,unknown>,method="POST"):Promise<T>{if(mutationBusy.current)throw new Error("A change is already being saved");if(!navigator.onLine)throw new Error("Offline. Reconnect before changing this activity; the server timer continues until a pause or stop is saved.");mutationBusy.current=true;setBusy(true);setError("");const signature=JSON.stringify({path,payload,method});if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};try{const result=await mutation<T>(path,payload,method,retry.current.key);retry.current=null;await refresh();return result}catch(e){setError((e as Error).message);void refresh().catch(()=>{});throw e}finally{mutationBusy.current=false;setBusy(false)}}
 async function startTask(taskId:string){const result=await perform<{activity:Activity}>("/api/sessions",{taskId});return result.activity}
 async function controlSession(action:Control,options?:{reflection?:string;description?:string}){if(!data?.activity)throw new Error("No active session");return perform<{activity:Activity;completion:Completion|null;balance:number}>(`/api/sessions/${data.activity.id}`,{action,revision:data.activity.revision,...options},"PATCH")}
 const activity=data?.activity??null;const elapsedMs=activeMilliseconds(activity,(now||Date.now())+offset.current);
 return <AppContext.Provider value={{data,activity,elapsedMs,online,busy,error,refresh,startTask,controlSession}}><div className="connection-status" aria-live="polite">{!online&&<p role="alert">Offline. Changes cannot be saved. The server timer continues until a pause or stop is confirmed.</p>}{error&&<p role="alert">{error} <button onClick={()=>void refresh().catch(()=>{})}>Retry</button></p>}</div>{children}</AppContext.Provider>
}
export function useApp(){const value=useContext(AppContext);if(!value)throw new Error("AppProvider is required");return value}
