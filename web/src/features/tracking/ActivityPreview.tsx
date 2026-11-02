"use client";
import { useState } from "react";
import styles from "./tracking.module.css";
export function ActivityPreview() {
 const [state,setState] = useState<"ready"|"tracking"|"paused"|"finished">("tracking");
 const [activity,setActivity] = useState("Walk");
 const [centered,setCentered] = useState(false);
 return <div className={styles.page}>
  <header className={styles.header}><div className={styles.eyebrow}><span>SLOTTY</span><span>● {state === "tracking" ? "IN PROGRESS" : state.toUpperCase()}</span></div><h1>TRACK ACTIVITY</h1><p>Central Park, New York · Morning {activity.toLowerCase()}</p></header>
  <label className={styles.type}>Activity type <select value={activity} disabled={state === "tracking" || state === "paused"} onChange={e => setActivity(e.target.value)}><option>Walk</option><option>Run</option></select></label>
  <p className={styles.hint}>{state === "tracking" || state === "paused" ? "Activity type is locked while tracking." : "Choose your activity before starting."}</p>
  <details className={styles.verification}>
   <summary>View Slotty verification <span aria-hidden="true">⌄</span></summary>
   <div><h2>Slotty verification</h2><p className={styles.verificationStatus}>Preview only · Not verified</p><dl><div><dt>Activity</dt><dd>{activity}</dd></div><div><dt>GPS collection</dt><dd>Not connected</dd></div><div><dt>Measured session time</dt><dd>Not connected</dd></div><div><dt>Token eligibility</dt><dd>Not evaluated</dd></div></dl><p>The map, distance, pace and timer use sample data. Slotty has not verified this activity, and no tokens will be awarded in this preview.</p><p>When tracking is connected, rewards will use measured activity time: one token per full 30 minutes in a completed session.</p></div>
  </details>
  <div className={styles.map}>
   <svg viewBox="0 0 360 380" role="img" aria-label="Illustrated preview of a loop around Central Park reservoir. This is not a live GPS map.">
    <rect width="360" height="380" fill="#223128"/>
    <g transform="rotate(-8 180 190)"><path d="M60 -20L74 410M294 -20L304 410" stroke="#d0d0bc" strokeWidth="16"/><path d="M60 -20L74 410M294 -20L304 410" stroke="#fffef0" strokeWidth="7"/>
    <g fill="none" stroke="#555955" strokeWidth="6"><path d="M23 30h24v300H23zM316 55h22v150h-22M23 80h24m-24 50h24m-24 50h24m-24 50h24m-24 50h24M316 105h22m-22 50h22"/></g>
    <path d="M95 73Q165 84 247 82Q258 124 240 178Q219 202 233 235Q250 275 235 297Q170 305 102 290Q77 242 88 210Q104 180 94 145Q81 106 95 73Z" fill="none" stroke="#f5f4e8" strokeWidth="4"/>
    <ellipse cx="173" cy="175" rx="74" ry="91" fill="#203a43" stroke="#f7f6e9" strokeWidth="11"/>
    <path d="M130 320L132 260C80 231 85 113 139 83C181 68 228 95 243 128" fill="none" stroke="#0d1210" strokeWidth="9"/><path d="M130 320L132 260C80 231 85 113 139 83C181 68 228 95 243 128" fill="none" stroke="#f94d7a" strokeWidth="4"/>
    <circle cx="130" cy="320" r="5" fill="#26382e" stroke="#ff4b7a" strokeWidth="3"/><circle cx="243" cy="128" r="12" fill="#5399e755"/><circle cx="243" cy="128" r="5" fill="#4f9fe9" stroke="#cbe6ff" strokeWidth="2"/></g>
    <g fill="#a8afac" fontFamily="Arial,sans-serif" textAnchor="middle"><text x="184" y="43" fontSize="10" letterSpacing="2">CENTRAL PARK</text><text x="193" y="166" fontSize="10">Jacqueline</text><text x="193" y="181" fontSize="10">Kennedy Onassis</text><text x="193" y="196" fontSize="10">Reservoir</text><text x="224" y="344" fontSize="9">Great Lawn</text><text x="39" y="357" fontSize="8">500 ft</text></g>
   </svg>
   <span className={styles.signal}>● GPS preview</span><span className={styles.north}>N ↑</span><button className={styles.center} type="button" aria-label="Center preview map" onClick={() => setCentered(true)}>⌖</button>
  </div>
  <div className={styles.stats}><div><span>Distance</span><strong>1.24<small> mi</small></strong></div><div><span>Elapsed time</span><strong>24:48</strong></div><div><span>Current pace</span><strong className={styles.pace}>19:32<small> /mi</small></strong></div><div><span>Average pace</span><strong className={styles.pace}>20:00<small> /mi</small></strong></div></div>
  <div className={styles.controls}><button type="button" disabled={state === "tracking"} onClick={() => {setState("tracking");setCentered(false);}}>▷ {state === "paused" ? "Resume" : "Start Activity"}</button><button className={styles.primary} type="button" disabled={state !== "tracking"} onClick={() => setState("paused")}>Ⅱ Pause</button></div>
  <button className={styles.finish} type="button" disabled={state === "finished" || state === "ready"} onClick={() => setState("finished")}>□ Finish Activity</button>
  <p role="status" className={styles.hint}>{state === "finished" ? "Preview finished. No activity or tokens were saved." : centered ? "Preview map is centered on the sample route." : state === "paused" ? "Preview paused. Resume when you’re ready." : "Design preview · Static sample route and metrics · GPS is not active"}</p>
 </div>;
}
