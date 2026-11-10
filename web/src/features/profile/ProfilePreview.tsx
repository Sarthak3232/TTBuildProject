"use client";
import { useState } from "react";
import styles from "./profile.module.css";
const counts:Record<number,number>={23:2,24:4,25:3,26:5,27:3,28:2,29:3};
export function ProfilePreview(){
 const [selected,setSelected]=useState<number|null>(null);
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.eyebrow}><span>Slotty</span><span>♨ 5 day streak</span></div><h1>YOUR PROFILE.</h1><p>Your effort. Your progress. Your rewards.</p></header>
  <section className={styles.identity} aria-label="Sample profile"><div className={styles.avatar}>SK</div><div><h2>Sar</h2><p>A little focus goes a long way.</p></div></section>
  <div className={styles.stats}><section><div><span className={styles.red} aria-hidden="true">⊙</span><strong>22</strong></div><h2>Tasks completed</h2><p>Oct 23–29</p></section><section><div className={styles.gold}><span aria-hidden="true">◎</span><strong>8</strong></div><h2>Total tokens</h2><p>Current balance</p></section></div>
  <h2 className={styles.sectionTitle}>Daily completions</h2>
  <section className={styles.calendar} aria-labelledby="calendar-title"><div className={styles.calendarHeading}><h3 id="calendar-title">October 2026</h3><span>Sample today · 29</span></div>
   <div className={styles.weekdays} aria-hidden="true">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div>
   <div className={styles.days} aria-label="October 2026 daily completions">{Array.from({length:4},(_,i)=><span key={`blank-${i}`} />)}{Array.from({length:31},(_,i)=>i+1).map(day=><button type="button" key={day} className={`${counts[day]?styles.completed:""} ${day===29?styles.today:""}`} aria-pressed={selected===day} aria-label={`October ${day}, 2026: ${counts[day]??0} completed tasks${day===29?", sample today":""}`} onClick={()=>setSelected(day)}><span>{day}</span>{counts[day]&&<strong>{counts[day]}</strong>}</button>)}</div>
   <div className={styles.legend}><p><span /> Number = tasks completed that day</p><p>No count = no recorded activity available</p></div>
   {selected!==null&&<p role="status" className={styles.selection}>October {selected}: {counts[selected]??0} completed tasks in this preview.</p>}
  </section>
  <p className={styles.preview}>Design preview · Sample profile, tokens and activity · Not account data</p>
 </div>;
}
