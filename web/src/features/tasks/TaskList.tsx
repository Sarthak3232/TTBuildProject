"use client";
import Link from "next/link";
import { useState } from "react";
import { Field } from "@/components/forms/Field";
import { Progress } from "@/components/progress/Progress";
import styles from "./tasks.module.css";

type Task = { id: number; name: string; category: string; time: string; tokens: number; done: boolean; upcoming?: boolean; question?: string };
const fixtures: Task[] = [
 { id: 1, name: "Study 2 Hours", category: "Personal growth", time: "12:30 PM", tokens: 4, done: false },
 { id: 2, name: "Walk 1 Hour", category: "Wellbeing", time: "6:00 PM", tokens: 2, done: false },
 { id: 3, name: "Study 1 Hour", category: "Wellbeing", time: "7:15 AM", tokens: 2, done: true },
 { id: 4, name: "Run 1 Hour", category: "Focus", time: "8:00 AM", tokens: 2, done: true },
 { id: 5, name: "Walk 1 hour", category: "Focus", time: "9:30 AM", tokens: 2, done: true },
];
export function TaskList() {
 const [tab, setTab] = useState("Today");
 const [tasks, setTasks] = useState(fixtures);
 const [adding, setAdding] = useState(false);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");
 const visible = tasks.filter(task => tab === "All lists" ? !task.done : (tab === "Upcoming" ? task.upcoming && !task.done : !task.upcoming));
 const completed = visible.filter(task => task.done).length;
 function addTask(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") ?? "").trim();
  const minutes = Number(data.get("minutes"));
  if (!name || !Number.isFinite(minutes) || minutes < 30 || !Number.isInteger(minutes)) { setError("Enter a name and a whole-number minimum of at least 30 minutes."); return; }
  setTasks(current => [...current, { id: Date.now(), name, category: "Custom", time: `${minutes} min minimum`, tokens: Math.floor(minutes / 30), done: false, upcoming: tab === "Upcoming", question: String(data.get("question") ?? "").trim() }]);
  setAdding(false); setError(""); setNotice("Task added to this preview. Changes reset when you reload.");
 }
 function rows(done: boolean) { return visible.filter(task => task.done === done).map(task => <li key={task.id}>
  <span className={`${styles.check} ${done ? styles.checked : ""}`} aria-label={done ? "Completed preview task" : "Not completed"}>{done ? "✓" : ""}</span>
  <div><h3>{task.name}</h3><p>{task.category} · {task.time}</p>{task.question && <p>Reflection: {task.question}</p>}</div><span className={styles.tokens}>+{task.tokens}</span>
 </li>); }
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.eyebrow}><span>Slotty</span><span>♨ 5 day streak</span></div><h1>YOUR TASK LIST</h1><p>A clear plan. A little more headspace.</p></header>
  <details className={styles.rhythm}><summary><span className={styles.sun} aria-hidden="true">☼</span><span><strong>My daily rhythm</strong><small>{tasks.filter(t => !t.upcoming).length} tasks · {tasks.filter(t => !t.upcoming).reduce((total,t) => total + t.tokens, 0)} tokens possible</small></span><span className={styles.chevron} aria-hidden="true">⌄</span></summary><p>One token for every full 30 minutes in a completed session. Preview tasks do not earn real tokens.</p><div><Link href="/tasks/studbot">Open Studbot →</Link><Link href="/tasks/runTracker">Run / Walk Tracker →</Link></div></details>
  <div className={styles.filters} aria-label="Task list filters">{["Today", "Upcoming", "All lists"].map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div>
  <div className={styles.progress}><Progress label={`${completed} of ${visible.length} completed`} max={visible.length || 1} value={completed} valueText={`${visible.length ? Math.round(completed / visible.length * 100) : 0}%`} /></div>
  {visible.length === 0 ? <div className={styles.empty}><h2>A little room to plan.</h2><p>No upcoming tasks in this preview. Add a task to get started.</p></div> : <>
   <section className={styles.section}><div className={styles.sectionTitle}><h2>Still to do</h2><span>{visible.length - completed} tasks</span></div><ul className={styles.list}>{rows(false)}</ul></section>
   <section className={styles.section}><div className={styles.sectionTitle}><h2>In the bag</h2><span>{completed} completed</span></div><ul className={styles.list}>{rows(true)}</ul></section>
  </>}
  <button className={styles.add} type="button" aria-expanded={adding} aria-controls="add-task-form" onClick={() => setAdding(!adding)}> {adding ? "Close form" : "Add a task"}<span aria-hidden="true">{adding ? "−" : "+"}</span></button>
  {adding && <form id="add-task-form" className={styles.form} onSubmit={addTask}>
   <h2>A new little goal</h2><Field id="task-name" label="Task name" required>{props => <input {...props} name="name" maxLength={100} autoFocus />}</Field>
   <Field id="task-minimum" label="Minimum duration (minutes)" required hint="At least 30 minutes. Exactly 30 is valid." error={error || undefined}>{props => <input {...props} name="minutes" type="number" min={30} step={1} defaultValue={30} />}</Field>
   <Field id="task-question" label="Reflection question" hint="Optional. One question for completion.">{props => <input {...props} name="question" maxLength={200} />}</Field>
   <button type="submit" className={styles.add}>Add to preview <span aria-hidden="true">+</span></button>
  </form>}
  <p role="status" className={styles.notice}>{notice}</p>
  <div className={styles.activityLinks}><Link href="/tasks/studbot">Studbot →</Link><Link href="/tasks/runTracker">Run / Walk →</Link></div>
  <p className={styles.preview}>Design preview · Sample tasks · Changes are not saved</p>
 </div>;
}
