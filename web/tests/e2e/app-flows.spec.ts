import { test,expect,type Page } from "@playwright/test";
import { installFakeUsb, connectMachine, motorCommands } from "../support/usbBrowser";
import type { fakeReelMotor } from "../support/fakeReelMotor";
import type { AppData,Task,Activity,Completion,Roll } from "../../src/domain/activity";
const custom:Task={id:"22222222-2222-4222-8222-222222222222",kind:"custom",name:"Crochet",description:"Make something",minimumMs:1800000,reflectionQuestion:"What did you make?",archivedAt:null};
const sessionId="44444444-4444-4444-8444-444444444444";
async function fixtures(page:Page,balance=0,rollResult?:Pick<Roll,"won"|"slot"|"threshold"|"wheels">,motorOptions:Parameters<typeof fakeReelMotor>[0]={},dropRollResponse=false){
 await installFakeUsb(page,motorOptions);const committed=new Map<string,Roll>();let dropped=false;
 const stamp=new Date().toISOString();const data:AppData={profile:{displayName:"Test",timezone:"UTC",email:"test@example.invalid"},balance,tasks:[{...custom,id:"11111111-1111-4111-8111-111111111111",kind:"run",name:"Run",minimumMs:null,reflectionQuestion:null},custom],activity:null,goals:[],today:stamp.slice(0,10),earnedToday:0,completedToday:0,completionCount:0,latestRoll:null,serverTime:stamp};
 const writes:{path:string;body:Record<string,unknown>}[]=[];
 await page.route("**/api/**",async route=>{const request=route.request();const path=new URL(request.url()).pathname;let result:unknown={};
  if(request.method()==="GET")result=path==="/api/app"?{...data,serverTime:new Date().toISOString()}:path==="/api/wallet"?{entries:[],hasMore:false}:{};
  else{const body=request.postDataJSON();writes.push({path,body});if(path==="/api/tasks"){const task={...custom,id:"33333333-3333-4333-8333-333333333333",name:body.name,minimumMs:body.minimumMs,reflectionQuestion:body.reflectionQuestion};data.tasks.push(task);result={task}}
   if(path==="/api/sessions"){const task=data.tasks.find(t=>t.id===body.taskId)!;const activity:Activity={id:sessionId,taskId:task.id,task,state:"running",revision:0,activeSince:new Date(Date.now()-1800000).toISOString(),accumulatedMs:0,eligibleMs:0,startedAt:new Date(Date.now()-1800000).toISOString(),serverTime:new Date().toISOString()};data.activity=activity;result={activity}}
   if(path===`/api/sessions/${sessionId}`){const current=data.activity!;if(body.action==="complete"){const completion:Completion={id:"55555555-5555-4555-8555-555555555555",sessionId,task:current.task,description:body.description??"",reflection:body.reflection??null,completedAt:new Date().toISOString(),timezone:"UTC",eligibleMs:1800000,distanceM:null,tokenAward:1};data.activity=null;data.balance+=1;data.completionCount++;data.earnedToday++;data.completedToday++;result={activity:{...current,state:"completed",activeSince:null,accumulatedMs:1800000,eligibleMs:1800000,revision:current.revision+1},completion,balance:data.balance}}else{data.activity={...current,state:body.action==="pause"?"paused":"running",activeSince:body.action==="pause"?null:new Date().toISOString(),accumulatedMs:1800000,eligibleMs:1800000,revision:current.revision+1};result={activity:data.activity,completion:null,balance:data.balance}}}
   if(path==="/api/goals"){data.goals.push({id:"66666666-6666-4666-8666-666666666666",taskId:body.taskId,taskName:data.tasks.find(t=>t.id===body.taskId)!.name,localDate:data.today,targetMs:body.targetMs,progressMs:0,provisionalMs:0,timezone:"UTC",repeatKind:body.repeatKind,weekdays:body.weekdays??null,completedAt:null});result={id:data.goals[0].id}}
   if(path==="/api/rolls" && committed.has(body.key)){result={roll:committed.get(body.key)}}else if(path==="/api/rolls"){const cost=(body.allocations as number[]).reduce((sum,n)=>sum+n,0);data.balance-=cost;data.latestRoll={id:"77777777-7777-4777-8777-777777777777",allocations:body.allocations,cost,threshold:313387,won:true,slot:1,wheels:["garnet","garnet","garnet"],...rollResult,policyVersion:"roll-v1",deliveryState:"hardware_pending",createdAt:new Date().toISOString(),balance:data.balance};result={roll:data.latestRoll};committed.set(body.key,data.latestRoll)}
  }
  if(dropRollResponse&&!dropped&&path==="/api/rolls"&&request.method()==="POST"){dropped=true;await route.fulfill({status:503,json:{error:{message:"Response lost after saving"}}});return}await route.fulfill({json:result});
 });return {data,writes};
}
test("custom timer completion requires reflection and refreshes wallet",async({page})=>{const{writes}=await fixtures(page);await page.goto("http://127.0.0.1:3101/tasks");await page.getByRole("button",{name:"Start task",exact:true}).click();await expect(page.getByRole("button",{name:"Complete & save"})).toBeDisabled();await page.getByLabel("What did you make?").fill("A scarf");await page.getByRole("button",{name:"Pause",exact:true}).click();await expect(page.getByText("Paused · time does not count")).toBeVisible();await page.getByRole("button",{name:"Resume",exact:true}).click();await page.getByRole("button",{name:"Complete & save"}).click();await expect(page.getByText("Saved Crochet. Earned 1 tokens.",{exact:true})).toBeVisible();await expect(page.getByText("1 tokens",{exact:true})).toBeVisible();expect(writes.map(w=>w.body.action).filter(Boolean)).toEqual(["pause","resume","complete"]);expect(writes.at(-1)?.body.reflection).toBe("A scarf");expect(writes.every(w=>typeof w.body.key==="string")).toBe(true)});
test("custom creation and weekday goals send persisted definitions",async({page})=>{const{writes}=await fixtures(page);await page.goto("http://127.0.0.1:3101/create");await page.getByRole("button",{name:"Create a custom task"}).click();await page.getByLabel("Task name").fill("Practice guitar");await page.getByLabel("Minimum duration (minutes)").fill("30");await page.getByRole("button",{name:"Save task",exact:true}).click();await expect(page.getByRole("button",{name:"Create a custom task"})).toBeVisible();await page.getByRole("combobox",{name:"Activity",exact:true}).selectOption(custom.id);await page.getByRole("combobox",{name:"Repeat",exact:true}).selectOption("weekdays");await page.getByRole("button",{name:"Save goal",exact:true}).click();await expect(page.getByRole("status")).toContainText("Goal saved");expect(writes.find(w=>w.path==="/api/tasks")?.body.minimumMs).toBe(1800000);expect(writes.find(w=>w.path==="/api/goals")?.body.weekdays).toEqual([1,2,3,4,5]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)});
test("USB roll shows fixed outcome, debits once, and opens only the selected drawer",async({page})=>{const{writes}=await fixtures(page,5);await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();await expect(page.getByRole("button",{name:"Spin now"})).toBeEnabled();await page.getByRole("button",{name:"Spin now"}).click();await expect(page.getByRole("heading",{name:"You won slot 1!"})).toBeVisible();await expect(page.getByLabel("Saved wheel results").getByText("garnet",{exact:true})).toHaveCount(3);await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("drawer 1 closed");expect((await motorCommands(page)).filter(c=>c.startsWith("DOPEN"))).toEqual(["DOPEN 0"]);await expect(page.getByLabel("Token balance")).toContainText("3");expect(writes.filter(w=>w.path==="/api/rolls")).toHaveLength(1);expect(writes.find(w=>w.path==="/api/rolls")?.body.allocations).toEqual([2,0,0,0]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)});

test("a high-probability loss displays two matching wheels and no reward",async({page})=>{
 const{writes}=await fixtures(page,10,{won:false,slot:null,threshold:524450,wheels:["hammer","hammer","tongs"]});
 await page.goto("http://127.0.0.1:3101/redeem");
 await connectMachine(page);
 for(let i=0;i<6;i++)await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await page.getByRole("button",{name:"Spin now"}).click();
 await expect(page.getByRole("heading",{name:"No win this time."})).toBeVisible();
 const wheels=page.getByLabel("Saved wheel results");
 await expect(wheels.getByText("hammer",{exact:true})).toHaveCount(2);
 await expect(wheels.getByText("tongs",{exact:true})).toHaveCount(1);
 await expect(page.getByText("No entitlement was created.",{exact:false})).toBeVisible();
 await expect(page.getByLabel("Token balance")).toContainText("4");
 expect(writes.filter(w=>w.path==="/api/rolls")).toHaveLength(1);
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("No drawer opened");
 expect((await motorCommands(page)).some(c=>c.startsWith("DOPEN"))).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("reopening a saved loss preserves the three wheel outputs without a new roll",async({page})=>{
 const{data,writes}=await fixtures(page,4);
 data.latestRoll={id:"77777777-7777-4777-8777-777777777777",allocations:[1,0,0,0],cost:1,threshold:200000,won:false,slot:null,wheels:["jacqueminot","garnet","hammer"],policyVersion:"roll-v1",deliveryState:"not_applicable",createdAt:new Date().toISOString(),balance:4};
 await page.goto("http://127.0.0.1:3101/redeem");
 const wheels=page.getByLabel("Saved wheel results");
 await expect(wheels.getByText("jacqueminot",{exact:true})).toBeVisible();
 await page.reload();
 await expect(wheels.getByText("jacqueminot",{exact:true})).toBeVisible();
 await expect(wheels.getByText("garnet",{exact:true})).toBeVisible();
 await expect(wheels.getByText("hammer",{exact:true})).toBeVisible();
 expect(writes).toHaveLength(0);
});

test("reel power toggle releases and holds without spinning or opening drawers",async({page})=>{
 const{writes}=await fixtures(page,4);
 await page.goto("http://127.0.0.1:3101/redeem");
 await expect(page.getByRole("button",{name:"Power on reels",exact:true})).toBeDisabled();
 await connectMachine(page);
 await page.getByRole("button",{name:"Depower reels",exact:true}).click();
 await expect(page.getByText("Reel power off. Reels are released.",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Power on reels",exact:true})).toBeEnabled();
 await page.screenshot({path:test.info().outputPath("reel-power-off.png"),fullPage:true});
 await page.getByRole("button",{name:"Power on reels",exact:true}).click();
 await expect(page.getByText("Reel power on. Reels are holding their positions.",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Depower reels",exact:true})).toBeEnabled();
 expect((await motorCommands(page)).filter(c=>c!=="ALIGNED 1")).toEqual(["EN 0","EN 1"]);
 expect(writes).toHaveLength(0);
 await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByRole("button",{name:"Depower reels",exact:true})).toBeDisabled();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("drawer 1 closed");
 await expect(page.getByRole("button",{name:"Depower reels",exact:true})).toBeEnabled();
});

test("USB readiness blocks payment and connection confirms alignment without motion",async({page})=>{
 const{writes}=await fixtures(page,4);
 await page.goto("http://127.0.0.1:3101/redeem");
 await expect(page.getByRole("button",{name:"Spin now",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"Connect USB",exact:true}).click();
 await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("USB connected");
 expect(await motorCommands(page)).toEqual(["ALIGNED 1"]);
 await expect(page.getByRole("button",{name:"Spin now",exact:true})).toBeEnabled();
 expect(writes).toHaveLength(0);
});

test("winning slot determines the drawer independently of the wheel symbol",async({page})=>{
 const{writes}=await fixtures(page,4,{won:true,slot:4,threshold:200000,wheels:["garnet","garnet","garnet"]});
 await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);
 await page.getByRole("button",{name:"Add one token to slot 4",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("drawer 4 closed");
 const commands=await motorCommands(page);
 expect(commands.filter(c=>c.startsWith("DOPEN"))).toEqual(["DOPEN 3"]);
 expect(commands.find(c=>c.startsWith("SPIN"))!.split(" ").slice(1).every(a=>[11250,29250].includes(Number(a)))).toBe(true);
 expect(commands.filter(c=>c.startsWith("DCLOSE"))).toEqual(["DCLOSE 3"]);
 expect(writes.filter(w=>w.path==="/api/rolls")).toHaveLength(1);
 await expect(page.getByRole("button",{name:"Confirm sector order"})).toBeDisabled();
});

test("partial calibration enables only slots 1 and 4 and marks the selected drawer closed",async({page})=>{
 await fixtures(page,4,{won:true,slot:4,threshold:200000,wheels:["garnet","garnet","garnet"]},{drawerCalibration:"1001"});
 await page.goto("http://127.0.0.1:3101/redeem");
 await page.getByRole("button",{name:"Connect USB",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("Machine ready");
 await expect(page.getByRole("button",{name:"Add one token to slot 2",exact:true})).toBeDisabled();
 await expect(page.getByRole("button",{name:"Add one token to slot 3",exact:true})).toBeDisabled();
 await expect(page.getByRole("button",{name:"Add one token to slot 1",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Add one token to slot 4",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("drawer 4 closed");
 const commands=await motorCommands(page);const marked=commands.indexOf("DMARK 3 closed");
 expect(marked).toBeGreaterThan(-1);expect(commands[marked+1]).toBe("DOPEN 3");
 expect(commands.filter(c=>c.startsWith("DCLOSE"))).toEqual(["DCLOSE 3"]);
});

test("ten tokens on one slot guarantees that slot, while a spread total of ten uses normal odds",async({page})=>{
 await fixtures(page,50);
 await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);
 for(let i=0;i<5;i++){
  await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
  await page.getByRole("button",{name:"Add one token to slot 2",exact:true}).click();
 }
 await expect(page.getByText("58.0%",{exact:true})).toBeVisible();
 for(let i=0;i<5;i++)await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await expect(page.getByText("100.0%",{exact:true})).toBeVisible();
 await expect(page.getByText("Slot 1: 100.0% conditional on a win · 100.0% overall",{exact:true})).toBeVisible();
 await expect(page.getByText("Slot 2: 0.0% conditional on a win · 0.0% overall",{exact:true})).toBeVisible();
});

test("an incorrect landing blocks the drawer and survives a reload without replay",async({page})=>{
 const{writes}=await fixtures(page,4,undefined,{wrongLanding:true});
 await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);
 await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByRole("button",{name:"I inspected and resolved this delivery"})).toBeVisible();
 expect((await motorCommands(page)).some(c=>c.startsWith("DOPEN"))).toBe(false);
 await page.reload();
 await expect(page.getByRole("button",{name:"I inspected and resolved this delivery"})).toBeVisible();
 await page.getByRole("button",{name:"Connect USB",exact:true}).click();
 await expect(page.getByRole("button",{name:"Send saved result to machine"})).toBeDisabled();
 expect((await motorCommands(page)).some(c=>c.startsWith("SPIN"))).toBe(false);
 expect(writes.filter(w=>w.path==="/api/rolls")).toHaveLength(1);
});

test("reconnecting to a completed roll does not spin or open again",async({page})=>{
 const{writes}=await fixtures(page,4,{won:false,slot:null,threshold:200000,wheels:["hammer","garnet","tongs"]});
 await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);
 await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("No drawer opened");
 await page.reload();await connectMachine(page);
 await page.getByRole("button",{name:"Send saved result to machine"}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("No drawer opened");
 expect((await motorCommands(page)).some(c=>c.startsWith("SPIN")||c.startsWith("DOPEN"))).toBe(false);
 expect(writes.filter(w=>w.path==="/api/rolls")).toHaveLength(1);
});

test("a lost saved-roll response recovers the same result without double payment",async({page})=>{
 const{writes,data}=await fixtures(page,4,undefined,{},true);
 await page.goto("http://127.0.0.1:3101/redeem");await connectMachine(page);
 await page.getByRole("button",{name:"Add one token to slot 1",exact:true}).click();
 await page.getByRole("button",{name:"Spin now",exact:true}).click();
 await expect(page.getByRole("button",{name:"Recover roll",exact:true})).toBeEnabled();
 expect((await motorCommands(page)).some(c=>c.startsWith("SPIN"))).toBe(false);
 await page.getByRole("button",{name:"Recover roll",exact:true}).click();
 await expect(page.getByLabel("USB slot machine").getByRole("status")).toContainText("drawer 1 closed");
 const requests=writes.filter(w=>w.path==="/api/rolls");
 expect(requests).toHaveLength(2);expect(requests[0].body.key).toBe(requests[1].body.key);
 expect(data.balance).toBe(3);expect((await motorCommands(page)).filter(c=>c.startsWith("SPIN"))).toHaveLength(1);
});
