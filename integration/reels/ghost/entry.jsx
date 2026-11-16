import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RewardPreview } from "@/features/redeem/RewardPreview";
import { AppProvider, useApp } from "@/features/app/AppProvider";
import { selectOutcome, winThreshold, ROLL_SCALE } from "@/domain/rolls/probability";

const key = "slotty-ghost-wallet-v1";
const load = () => JSON.parse(localStorage.getItem(key) || '{"balance":30,"rolls":[]}');
const reply = (data, status=200) => Response.json(data,{status});
const deviceFetch = window.fetch.bind(window);
window.fetch = async (input, options={}) => {
  const url = new URL(input, "http://localhost");
  const wallet = load();
  const latestRoll = wallet.rolls[0]?.roll || null;
  if(url.pathname === "/api/app") return reply({balance:wallet.balance, latestRoll,profile:{email:"demo@example.invalid"},activity:null,tasks:[],goals:[],serverTime:new Date().toISOString()});
  if(url.pathname === "/api/wallet") return reply({entries:wallet.rolls.map(({roll})=>({id:roll.id,rollId:roll.id,delta:-roll.cost,balance:roll.balance,createdAt:roll.createdAt})),hasMore:false});
  if(url.pathname === "/api/rolls" && options.method === "POST"){
    const {key:requestKey,allocations} = JSON.parse(options.body);
    const previous=wallet.rolls.find(row=>row.key===requestKey);
    if(previous)return reply({roll:previous.roll});
    const cost=allocations.reduce((a,b)=>a+b,0);
    if(cost<1 || cost>wallet.balance)return reply({error:{message:"Insufficient demo tokens"}},409);
    const sample=Math.floor(Math.random()*ROLL_SCALE);
    const threshold=winThreshold(cost);
    const outcome=selectOutcome(allocations,sample,sample<threshold?Math.floor(Math.random()*cost):null);
    const roll={id:crypto.randomUUID(),allocations,cost,threshold,...outcome,policyVersion:"roll-v1",deliveryState:outcome.won?"hardware_pending":"not_applicable",createdAt:new Date().toISOString(),balance:wallet.balance-cost};
    wallet.balance=roll.balance;
    wallet.rolls.unshift({key:requestKey,roll});
    localStorage.setItem(key,JSON.stringify(wallet));
    window.dispatchEvent(new CustomEvent("slotty-roll-saved",{detail:roll}));
    return reply({roll});
  }
  if(url.pathname === "/api/rolls") return reply({roll:wallet.rolls.find(row=>row.roll.id===url.searchParams.get("id"))?.roll});
  return reply({error:{message:"Unavailable in offline demo"}},404);
};
function Demo(){
  const {data}=useApp();
  const [connected,setConnected]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("USB demo · simulated reel movement");
  async function request(path,body){
    const response=await deviceFetch("/device/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error || "USB bridge unavailable");
    return result;
  }
  async function connect(){
    setBusy(true);
    try{
      const result=await request("connect",{});
      setConnected(true);
      setMessage(result.message);
    }catch(error){
      setConnected(false);
      setMessage("Connection failed: "+error.message+" Close Serial Monitor and try again.");
    }finally{setBusy(false);}
  }
  async function send(roll){
    setBusy(true);
    setMessage("Waiting for ESP32 completion…");
    try{
      const result=await request("deliver",{roll});
      const receipt=result.replay?"Saved receipt · no repeat motion":result.status==="completed"?"ESP32 replied SIM DONE spin":result.detail;
      setMessage(receipt+" · target "+result.target+" · "+result.status+" · "+roll.id);
      if(result.status==="unconfirmed")setConnected(false);
    }catch(error){
      setMessage("Roll saved. USB delivery error: "+error.message);
      setConnected(false);
    }finally{setBusy(false);}
  }
  useEffect(()=>{
    function onRoll(event){if(connected)void send(event.detail);}
    window.addEventListener("slotty-roll-saved",onRoll);
    return ()=>window.removeEventListener("slotty-roll-saved",onRoll);
  },[connected]);
  const local=location.origin==="http://127.0.0.1:8764";
  return <><aside><b>Slotty · USB demo</b><span>Local demo wallet</span>
    {local?<><button disabled={busy || connected} onClick={connect}>{connected?"ESP32 connected":"Connect ESP32"}</button>
    <button disabled={busy || !connected || !data?.latestRoll} onClick={()=>send(data.latestRoll)}>Send latest saved roll</button></>:
    <span>Open Start Slotty Live USB.cmd to connect a board.</span>}
    <output aria-live="polite" style={{width:"100%"}}>{message}</output></aside><RewardPreview/></>;
}
createRoot(document.querySelector("#root")).render(<AppProvider><Demo/></AppProvider>);
