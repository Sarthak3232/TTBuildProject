"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/features/app/client";
import styles from "@/features/auth/login.module.css";
export default function ResetPasswordPage(){const[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);return <main className={styles.page}><div className={styles.content}><h1>FRESH START.</h1><form className={styles.form} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);try{const r=await api<{message:string}>("/api/auth",{method:"POST",body:JSON.stringify({action:"password",password:String(f.get("password"))})});setNotice(r.message)}catch(error){setNotice((error as Error).message)}finally{setBusy(false)}}}><label>New password<div className={styles.input}><input type="password" name="password" autoComplete="new-password" minLength={8} maxLength={256} required/></div></label><button className={styles.login} disabled={busy}>Save password</button></form><p role="status">{notice}</p><Link href="/dashboard">Continue to dashboard →</Link></div></main>}
