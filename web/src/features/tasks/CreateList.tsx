"use client";
import { useRef, useState } from "react";
import styles from "./create.module.css";
import { StartTaskPreview } from "./StartTaskPreview";
import { ReuseTaskModal, type ReusableTask } from "./ReuseTaskModal";
export function CreateList() {
 const [focus, setFocus] = useState("Wellbeing");
 const [tasks, setTasks] = useState([{id:1, name:"Study", minutes:30, question:"", custom:false}, {id:2, name:"Run/Walk", minutes:30, question:"", custom:false}]);
 const [notice, setNotice] = useState("");
 const [showTask, setShowTask] = useState(false);
 const [reuseTask,setReuseTask] = useState<ReusableTask | null>(null);
 const invalidDuration = tasks.some(task => !Number.isInteger(task.minutes) || task.minutes < 30);
 const [deleteTask, setDeleteTask] = useState<{id:number; name:string} | null>(null);
 const deleteDialog = useRef<HTMLDialogElement>(null);
 const addButton = useRef<HTMLButtonElement>(null);
 if (showTask) return <StartTaskPreview onBack={() => setShowTask(false)} onAdd={(name, minutes, question) => { if (!Number.isInteger(minutes) || minutes < 30) return; setTasks(current => [...current, {id:Math.max(...current.map(t => t.id),0)+1, name, minutes, question, custom:true}]); }} />;
 return <div className={styles.page}>
  <header><div className={styles.eyebrow}><strong>Slotty</strong><span>♨ 5 day streak</span></div><h1>MAKE A TASK LIST</h1><p>Build a rhythm worth coming back to.</p></header>
  <form onSubmit={e => { e.preventDefault(); if (invalidDuration) return; setNotice("List prepared in this preview. Saving lists will be available after backend integration."); }}>
   <label className={styles.name}><span aria-hidden="true">☼</span><input aria-label="List name" required maxLength={100} defaultValue="Better mornings" /></label>
   <fieldset className={styles.focus}><legend>Give it a focus</legend>{["Wellbeing", "Focus", "Personal"].map(value => <label key={value}><input type="radio" name="focus" value={value} checked={focus === value} onChange={() => setFocus(value)} /><span>{value}</span></label>)}</fieldset>
   <div className={styles.schedule}><label>Starts<select name="starts" defaultValue="Tomorrow"><option>Today</option><option>Tomorrow</option></select></label><label>Repeat<select name="repeat" defaultValue="Weekdays"><option>Today only</option><option>Every day</option><option>Weekdays</option></select></label></div>
   <div className={styles.heading}><h2>Add your tasks</h2><span>{tasks.length} tasks</span></div>
   <div className={styles.tasks}>{tasks.map(task => <div key={task.id} className={styles.task}>
    <span className={styles.grip} aria-hidden="true">⠿</span>
    <input aria-label={`Task ${task.id} name`} required maxLength={100} value={task.name} onChange={e => setTasks(current => current.map(t => t.id === task.id ? {...t, name:e.target.value} : t))} />
    <label className={styles.duration}><span>Duration (minutes)</span><input type="number" required min={30} step={1} aria-label={`Minimum duration for task ${task.id} in minutes`} value={Number.isNaN(task.minutes) ? "" : task.minutes} onChange={e => setTasks(current => current.map(t => t.id === task.id ? {...t, minutes:e.target.valueAsNumber} : t))} /></label>
    <span className={styles.tokens}>+{Number.isFinite(task.minutes) && task.minutes >= 30 ? Math.floor(task.minutes/30) : 0}</span>
    {task.custom && <button className={styles.prepare} type="button" onClick={()=>setReuseTask(task)}>Start task</button>}
    <button className={styles.trash} type="button" aria-label={`Delete ${task.name || "untitled task"}`} onClick={() => { setDeleteTask({id:task.id,name:task.name}); deleteDialog.current?.showModal(); }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button>
   </div>)}</div>
   <button ref={addButton} className={styles.add} type="button" onClick={() => setShowTask(true)}>Add another task <span aria-hidden="true">+</span></button>
   <p className={styles.hint}>Each task requires at least 30 minutes. One token per full 30 minutes.</p>
   {invalidDuration && <p role="alert" className={styles.hint}>Every task needs a whole-number duration of at least 30 minutes.</p>}
   <button className={styles.prepare} type="submit" disabled={invalidDuration}>Preview this list</button>
   <p role="status" className={styles.hint}>{notice}</p>
  </form>
  <dialog ref={deleteDialog} className={styles.deleteDialog} aria-labelledby="delete-task-title" aria-describedby="delete-task-description" onClose={() => setDeleteTask(null)}>
   <h2 id="delete-task-title">Delete task?</h2>
   <p id="delete-task-description">Are you sure you want to delete this task?</p>
   <p className={styles.deleteName}>{deleteTask?.name || "Untitled task"}</p>
   <div className={styles.dialogActions}>
    <button type="button" autoFocus onClick={() => deleteDialog.current?.close()}>Cancel</button>
    <button type="button" className={styles.confirmDelete} onClick={() => {if (!deleteTask) return; setTasks(current => current.filter(task => task.id !== deleteTask.id)); setNotice(`${deleteTask.name || "Task"} deleted from this preview.`); deleteDialog.current?.close(); addButton.current?.focus();}}>Delete task</button>
   </div>
  </dialog>
  {reuseTask && <ReuseTaskModal key={reuseTask.id} task={reuseTask} onClose={()=>setReuseTask(null)} />}
  <p className={styles.hint}>Design preview · Changes are not saved</p>
 </div>;
}




