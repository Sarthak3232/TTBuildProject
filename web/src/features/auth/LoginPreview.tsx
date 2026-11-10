"use client";
import { useState } from "react";
import Link from "next/link";
import { SlotMachineIcon } from "@/components/navigation/SlotMachineIcon";
import styles from "./login.module.css";
export function LoginPreview({onEnter}:{onEnter:()=>void}) {
 const [showPassword,setShowPassword]=useState(false);
 const [notice,setNotice]=useState("");
 return <main className={styles.page}><div className={styles.content}>
  <Link className={styles.back} href="/dashboard" aria-label="Back to Slotty"><span aria-hidden="true">←</span> Back</Link>
  <div className={styles.brand}><Link href="/sign-up" aria-label="Sign up for Slotty"><SlotMachineIcon /></Link><span>Slotty</span></div>
  <h1>WELCOME BACK.</h1><p className={styles.intro}>Your next move starts here. Log in to keep your momentum going.</p>
  <form className={styles.form} onSubmit={event=>{event.preventDefault();onEnter();}}>
   <label>Email address<div className={styles.input}><span aria-hidden="true">✉</span><input type="email" autoComplete="email" placeholder="you@example.com" aria-label="Email address" /></div></label>
   <label>Password<div className={styles.input}><span aria-hidden="true">♙</span><input type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Enter your password" aria-label="Password" /><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(!showPassword)}>◎</button></div></label>
   <button className={styles.forgot} type="button" onClick={()=>setNotice("Password reset will be available when accounts are connected.")}>Forgot password?</button>
   <button className={styles.login} type="submit">Log in <span aria-hidden="true">→</span></button>
   <p className={styles.preview}>Preview access only · No account verification.<br />Leave fields blank to explore. Do not enter a real password.</p>
  </form>
  <p className={styles.signup}>New to Slotty? <Link href="/sign-up">Sign up</Link></p>
  <p role="status" className={styles.notice}>{notice}</p>
  <footer><span />A little focus. A little reward. All you.</footer>
 </div></main>;
}

