export class ClientError extends Error {
 constructor(public status:number,public code:string,message:string){super(message)}
}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...options,cache:"no-store",headers:{...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});
 const body=await response.json();
 if(!response.ok){if(response.status===401)window.location.href=new URL("/sign-in",window.location.origin).href;throw new ClientError(response.status,body.error?.code??"request",body.error?.message??"Request failed")}
 return body;
}
const retryKeys=new Map<string,string>();
export async function mutation<T>(path:string,body:Record<string,unknown>,method="POST",explicitKey?:string):Promise<T>{
 const signature=JSON.stringify({path,method,body});
 let storageKey:string|undefined;let key=explicitKey;
 if(!key){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(signature));
  storageKey=`slotty-mutation:${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("")}`;
  key=retryKeys.get(signature);
  if(!key){try{key=sessionStorage.getItem(storageKey)??undefined}catch{/* In-memory retries still work when storage is disabled. */}}
  key??=crypto.randomUUID();retryKeys.set(signature,key);
  try{sessionStorage.setItem(storageKey,key)}catch{/* In-memory retries still work when storage is disabled. */}
 }
 const result=await api<T>(path,{method,body:JSON.stringify({...body,key})});
 if(!explicitKey){retryKeys.delete(signature);try{if(storageKey)sessionStorage.removeItem(storageKey)}catch{/* No persisted retry key to clear. */}}
 return result;
}
