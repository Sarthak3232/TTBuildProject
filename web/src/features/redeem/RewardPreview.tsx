"use client";
import { useState } from "react";
import styles from "./rewards.module.css";
const balance = 8;
export function RewardPreview() {
 const [allocations,setAllocations] = useState([1,1,2,1]);
 const total = allocations.reduce((sum,value) => sum+value,0);
 const chance = total === 0 ? 0 : 0.2 + 0.4 * (1 - Math.exp(-(total-1)/3));
 function change(index:number,amount:number) { setAllocations(current => {
  const sum = current.reduce((a,b) => a+b,0);
  if(current[index]+amount < 0 || sum+amount > balance) return current;
  return current.map((value,i) => i === index ? value+amount : value);
 }); }
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.eyebrow}><span>Slotty</span><span>♨ 5 day streak</span></div><h1>WELL EARNED.</h1><p>Spend tokens for a chance at a slot-machine roll.</p></header>
  <section className={styles.balance} aria-label="Preview token balance"><div><h2>Available tokens</h2><span aria-hidden="true">◎</span></div><p><strong>{balance}</strong> tokens</p></section>
  <h2 className={styles.heading}>Choose your slot</h2>
  <div className={styles.slots}>{allocations.map((value,index) => <section key={index} className={styles.slot} aria-labelledby={`slot-${index}`}>
   <h3 id={`slot-${index}`} aria-label={`Slot ${index+1}`}>Slot</h3>
   <div className={styles.controls}><button type="button" aria-label={`Remove one token from slot ${index+1}`} disabled={value === 0} onClick={() => change(index,-1)}>−</button><output aria-label={`Slot ${index+1} allocation`}>{value}</output><span>{value === 1 ? "token" : "tokens"}</span><button type="button" aria-label={`Add one token to slot ${index+1}`} disabled={total >= balance} onClick={() => change(index,1)}>+</button></div>
  </section>)}</div>
  <section className={styles.summary} aria-labelledby="allocation-summary"><h2 id="allocation-summary">Your roll preview</h2><dl><div><dt>Total allocation</dt><dd>{total} / {balance} tokens</dd></div><div><dt>Unallocated tokens</dt><dd>{balance-total}</dd></div><div><dt>Chance of a win</dt><dd>{(chance*100).toFixed(1)}%</dd></div></dl><p>First, a roll decides whether you win. If you win, your allocation determines which one of the four slots opens.</p><ul>{allocations.map((value,index) => <li key={index}>Slot {index+1}: {total ? Math.round(value/total*100) : 0}% of winning outcomes</li>)}</ul><p>Tokens are spent on both wins and losses. At most one drawer opens per roll.</p><button type="button" disabled className={styles.roll}>Roll unavailable in preview</button></section>
  <p className={styles.preview}>Design preview · Sample token balance · Allocations are not saved. Rolling and locker delivery require backend integration.</p>
 </div>;
}
