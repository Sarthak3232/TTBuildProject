"use client";
import { useState } from "react";
import styles from "./history.module.css";
const periods = ["This week", "This month", "All time"] as const;
type Period = typeof periods[number];
const completions = [
 { date: "Today, Oct 29", tasks: [{ name: "Walk 1 Hour", time: "9:30 AM" }, { name: "Walk 1 Hour", time: "8:00 AM" }, { name: "Run 1 Hour", time: "7:15 AM" }] },
 { date: "Yesterday, Oct 28", tasks: [{ name: "Run 1 Hour", time: "6:20 PM" }, { name: "Study 1 Hour", time: "12:45 PM" }] },
 { date: "Tuesday, Oct 27", tasks: [{ name: "Study 1 Hour", time: "10:00 AM" }, { name: "Walk 1 Hour", time: "8:30 AM" }] },
 { date: "Monday, Oct 26", tasks: [{ name: "Run 1 Hour", time: "9:00 AM" }] },
 { date: "Friday, Oct 23", tasks: [{ name: "Study 1 Hour", time: "3:00 PM" }] },
 { date: "Thursday, Oct 22", tasks: [{ name: "Walk 1 Hour", time: "7:00 AM" }] },
];
const charts: Record<Period, {label:string; values:number[]; labels:string[]; count:number}> = {
 "This week": { label:"Oct 23 – 29", values:[1,0,0,1,2,2,3], labels:["F","S","S","M","T","W","T"], count:9 },
 "This month": { label:"October preview", values:[0,0,1,9], labels:["Oct 1–7","8–14","15–21","22–29"], count:10 },
 "All time": { label:"All recorded preview activity", values:[10], labels:["October"], count:10 },
};
export function CompletionLog() {
 const [period,setPeriod] = useState<Period>("This week");
 const [limit,setLimit] = useState(2);
 const chart = charts[period];
 const available = period === "This week" ? completions.slice(0,5) : completions;
 const groups = available.slice(0,limit);
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.eyebrow}><span>Slotty</span><span>♨ 5 day streak</span></div><h1>LOOK AT YOU GROW.</h1><p>Every finished task is a step forward.</p></header>
  <div className={styles.filters} aria-label="History period">{periods.map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => {setPeriod(value);setLimit(2);}}>{value}</button>)}</div>
  <section className={styles.summary} aria-label="Activity summary">
   <div className={styles.summaryHeading}><div><div><strong>{chart.count}</strong> <span>tasks done</span></div><p>{chart.label}</p></div><span className={styles.badge}>+{chart.count*2} tokens</span></div>
   <div className={styles.chart} role="img" aria-label={`${period}: ${chart.count} completed tasks. ${chart.values.map((value,i) => `${chart.labels[i]}: ${value}`).join('; ')}.`}>
    {chart.values.map((value,i) => <div key={i} className={styles.barColumn}><div className={styles.barArea}><span>{value}</span><div className={styles.bar} style={{height:`${value / Math.max(...chart.values,1) * 80}px`}} /></div><span className={styles.barLabel}>{chart.labels[i]}</span></div>)}
   </div>
  </section>
  <section className={styles.log} aria-labelledby="completion-log"><h2 id="completion-log">Completion log</h2>
   <div aria-live="polite">{groups.map(group => <section key={group.date} className={styles.group} aria-label={group.date}><div className={styles.groupHeading}><h3>{group.date}</h3><span>{group.tasks.length} done · +{group.tasks.length*2}</span></div>
    <ul>{group.tasks.map((task,i) => <li key={i}><span className={styles.check} aria-hidden="true">✓</span><div><h4>{task.name}</h4><p>My daily rhythm · {task.time}</p></div><span className={styles.tokens}>+2</span></li>)}</ul>
   </section>)}</div>
   <button className={styles.earlier} type="button" disabled={limit >= available.length} onClick={() => setLimit(current => current+2)}>{limit >= available.length ? "You’re all caught up" : "View earlier activity"}<span aria-hidden="true">↓</span></button>
  </section>
  <p className={styles.preview}>Design preview · Sample activity, not saved records</p>
 </div>;
}
