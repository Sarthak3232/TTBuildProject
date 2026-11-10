import type { Metadata } from "next";
import Link from "next/link";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard" };
const goals = [
  { name: "Run 1 hour", category: "Personal growth", time: "12:30 PM", complete: false },
  { name: "Walk 1 hour", category: "Wellbeing", time: "6:00 PM", complete: false },
  { name: "Study 1 hour", category: "Wellbeing", time: "Done at 7:15 AM", complete: true },
];

export default function DashboardPage() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.eyebrow}><span>Slotty</span><span className={styles.streak}>♨ 5 day streak</span></div>
        <h1>MAKE TODAY COUNT.</h1>
        <p>Thursday, October 29 · Good morning, Sar</p>
      </header>
      <section className={styles.hero} aria-label="Daily goal summary">
        <div className={styles.ring} role="img" aria-label="60 percent of today's goal"><div><strong>60%</strong><span>of today’s goal</span></div></div>
        <div className={styles.heroCopy}><span>YOU’RE ON A ROLL</span><h2>3 down.<br />2 to go.</h2><p>A little focus goes a long way.</p></div>
      </section>
      <div className={styles.stats}>
        <section className={styles.stat}><div><span aria-hidden="true">◎</span> 3</div><p>Your tokens</p></section>
        <section className={styles.stat}><div><span aria-hidden="true">↗</span> +3</div><p>Earned today</p></section>
      </div>
      <section aria-labelledby="next-moves">
        <div className={styles.sectionHeading}><h2 id="next-moves">Your next moves</h2><Link href="/tasks">View all 5 →</Link></div>
        <ul className={styles.goals}>{goals.map(goal => <li key={goal.name}>
          <span className={`${styles.check} ${goal.complete ? styles.checked : ""}`} aria-label={goal.complete ? "Completed" : "Not completed"}>{goal.complete ? "✓" : ""}</span>
          <div><h3>{goal.name}</h3><p>{goal.category} · {goal.time}</p></div><span className={styles.reward}>+1</span>
        </li>)}</ul>
      </section>
      <aside className={styles.rewardNote}><span aria-hidden="true">♧</span><div>Your next chance awaits.<p>1 token = 1 slot roll</p></div></aside>
      <Link className={styles.cta} href="/redeem">Explore your rewards <span aria-hidden="true">♧</span></Link>
      <p className={styles.preview}>Design preview · Sample goals and tokens</p>
    </div>
  );
}
