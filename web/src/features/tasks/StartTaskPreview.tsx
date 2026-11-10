"use client";
import { useState } from "react";
import styles from "./start-task.module.css";
export function StartTaskPreview({ onBack, onAdd }: { onBack: () => void; onAdd: (name: string, minutes: number, question: string) => void }) {
 const [name,setName] = useState("");
 const [question,setQuestion] = useState("");
 const [minutes,setMinutes] = useState(30);
 const [notice,setNotice] = useState("");
 const invalidDuration = !Number.isInteger(minutes) || minutes < 30;
 return <section className={styles.page} aria-labelledby="start-task-title">
  <button className={styles.back} type="button" onClick={onBack}>← Back to task list</button>
  <h1 id="start-task-title">TASK NAME</h1>
  <form onSubmit={event => {event.preventDefault(); if (!name.trim() || invalidDuration || notice) return; onAdd(name.trim(),minutes,question.trim());setNotice("Task added to your preview list. The timer stays static; tracking is not connected.");}}>
   <label className={styles.name}><span>Task name</span><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Enter task name" /></label>
   <label className={styles.reflection}><span>Personalized<br />Reflection<br />Question here…</span><textarea aria-label="Optional reflection question" maxLength={200} value={question} onChange={e => setQuestion(e.target.value)} placeholder="+ Add a reflection question (optional)" /></label>
   <section className={styles.timer} aria-label="Static timer preview"><h2>Timer</h2><span className={styles.plus} aria-hidden="true">+</span><output>00:00:00</output></section>
   <label className={styles.minimum}>Minimum duration (minutes)<input type="number" required min={30} step={1} value={Number.isNaN(minutes) ? "" : minutes} aria-invalid={invalidDuration} aria-describedby="duration-hint" onChange={e => setMinutes(e.target.valueAsNumber)} /><small id="duration-hint" role={invalidDuration ? "alert" : undefined}>{invalidDuration ? "Enter a whole number of at least 30 minutes to create this task." : "At least 30 minutes required."}</small></label>
   <button className={styles.start} type="submit" disabled={Boolean(notice) || invalidDuration || !name.trim()}>Start Task <span aria-hidden="true">⌄</span></button>
  </form>
  <p role="status" className={styles.note}>{notice}</p>
  <p className={styles.note}>Design preview · Timer and rewards are not active</p>
 </section>;
}


