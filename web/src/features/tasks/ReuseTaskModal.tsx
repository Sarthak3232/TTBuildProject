"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./reuse-task.module.css";
export type ReusableTask = {id:number;name:string;minutes:number;question:string};
export function ReuseTaskModal({task,onClose}:{task:ReusableTask;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [name,setName]=useState(task.name);
 const [question,setQuestion]=useState(task.question);
 const [minutes,setMinutes]=useState(task.minutes);
 const [started,setStarted]=useState(false);
 const valid=Boolean(name.trim())&&Number.isInteger(minutes)&&minutes>=30;
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>{element?.close();};},[]);
 return <dialog ref={dialog} className={styles.modal} aria-labelledby="reuse-task-title" onCancel={onClose}>
  <form onSubmit={event=>{event.preventDefault();if(valid&&!started)setStarted(true);}}>
   <header><h2 id="reuse-task-title">CREATE TASK</h2><span>JACKPOT</span></header>
   <label className={styles.title}><span className={styles.srOnly}>Task title</span><input required value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Insert Title" /><span aria-hidden="true">+</span></label>
   <label className={styles.reflection}>Post-Task Reflection (optional)<textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={200} placeholder="Enter your reflection question…" /></label>
   <div className={styles.actions}><label><span>Time (minutes)</span><input type="number" required min={30} step={1} aria-describedby="reuse-minimum" value={Number.isNaN(minutes)?"":minutes} onChange={e=>setMinutes(e.target.valueAsNumber)} /></label><button className={styles.start} type="submit" disabled={!valid||started}>Start Task <span aria-hidden="true">⌄</span></button></div>
   <p id="reuse-minimum" className={styles.hint}>Minimum 30 minutes · Preview only</p>
   {started&&<p role="status" className={styles.hint}>Ready to start {name}. Live timers and rewards are not connected yet.</p>}
   <button className={styles.cancel} type="button" onClick={onClose}>Cancel</button>
  </form>
 </dialog>;
}
