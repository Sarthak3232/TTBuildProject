"use client";
import Link from "next/link";
import { useState } from "react";
import { SlotMachineIcon } from "@/components/navigation/SlotMachineIcon";
import styles from "./login.module.css";
export function SignUpPreview(){
 const [showPassword,setShowPassword]=useState(false);
 const [notice,setNotice]=useState("");
 return <main className={styles.page}><div className={styles.content}>
  <div className={styles.brand}><SlotMachineIcon /><span>Slotty</span></div>
  <h1>YOUR NEXT MOVE.</h1><p className={styles.intro}>Build habits. Earn tokens. Make a little progress every day.</p>
  <form className={styles.form} onSubmit={event=>{event.preventDefault();setNotice("This is a sign-up preview. Account creation is not connected yet.");}}>
   <label>Display name<div className={styles.input}><input aria-label="Display name" autoComplete="nickname" placeholder="Your name" /></div></label>
   <label>Email address<div className={styles.input}><span aria-hidden="true">✉</span><input type="email" aria-label="Email address" autoComplete="email" placeholder="you@example.com" /></div></label>
   <label>Password<div className={styles.input}><input type={showPassword?"text":"password"} aria-label="Password" autoComplete="new-password" placeholder="Create a password" /><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(!showPassword)}>◎</button></div></label>
   <button className={styles.login} type="submit">Sign up <span aria-hidden="true">→</span></button>
   <p className={styles.preview}>Preview only · No account is created.<br />Do not enter a real password.</p>
  </form>
  <p role="status" className={styles.notice}>{notice}</p>
  <p className={styles.signup}>Already have an account? <Link href="/sign-in">Sign in</Link></p>
  <footer><span />A little focus. A little reward. All you.</footer>
 </div></main>;
}

