"use client";

import Link from "next/link";
import { useState } from "react";
import type { Completion } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/time/route";
import { useApp } from "@/features/app/AppProvider";
import { RouteMap } from "./RouteMap";
import { useRouteTracker } from "./useRouteTracker";
import { SavedActivityRoute } from "./SavedActivityRoute";
import styles from "./tracking.module.css";

/** Kept at the existing import path so links continue to open the real tracker. */
export function ActivityPreview({ savedSessionId }: { savedSessionId?: string }) {
  if (savedSessionId) return <div className={styles.page}><header className={styles.header}><h1>Saved activity</h1><p>Your private recorded run or walk.</p></header><SavedActivityRoute sessionId={savedSessionId} /><p><Link href="/history">Back to history</Link> · <Link href="/tasks/runTracker">Track a new activity</Link></p></div>;
  return <LiveActivityTracker />;
}

function LiveActivityTracker() {
  const { data, activity, elapsedMs, online, busy, error, startTask, controlSession } = useApp();
  const [selection, setSelection] = useState<"run" | "walk">("walk");
  const [summary, setSummary] = useState<Completion | null>(null);
  const [notice, setNotice] = useState("");
  const [description, setDescription] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const current = activity && (activity.task.kind === "run" || activity.task.kind === "walk") ? activity : null;
  const routeSessionId = current?.id ?? summary?.sessionId ?? null;
  const tracking = useRouteTracker(routeSessionId, current, online);
  const kind = current?.task.kind ?? summary?.task.kind ?? selection;
  const activityName = kind === "run" ? "Run" : "Walk";
  const activeMs = current ? elapsedMs : summary?.eligibleMs ?? 0;
  const distanceM = summary?.sessionId === routeSessionId && !current ? summary.distanceM ?? tracking.route.distanceM : tracking.route.distanceM;
  const stateLabel = current?.state ?? (summary ? "saved" : "ready");
  const disabled = busy || saving || !online;
  const anotherActivity = Boolean(activity && !current);

  async function start() {
    const task = data?.tasks.find(task => task.kind === selection && !task.archivedAt);
    if (!task) { setNotice("Your activity list is still loading. Retry in a moment."); return; }
    setNotice("");
    try {
      await startTask(task.id);
      setSummary(null); setDescription(""); setReflection("");
    } catch (cause) { setNotice((cause as Error).message); }
  }

  async function control(action: "pause" | "resume" | "complete" | "cancel") {
    setSaving(true); setNotice("");
    try {
      if (action !== "resume") await tracking.stopAndFlush();
      const result = await controlSession(action, { description, reflection });
      if (action === "complete" && result.completion) {
        setSummary(result.completion);
        setSelection(result.completion.task.kind === "run" ? "run" : "walk");
        setNotice(`Activity saved. ${result.completion.tokenAward} ${result.completion.tokenAward === 1 ? "token" : "tokens"} earned.`);
      } else if (action === "cancel") { setSummary(null); setNotice("Activity cancelled. No completion or tokens were added."); }
      else if (action === "resume") tracking.retryGps();
    } catch (cause) {
      setNotice((cause as Error).message);
      tracking.retryGps();
    } finally { setSaving(false); }
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><span>SLOTTY</span><span>{stateLabel.toUpperCase()}</span></div>
      <h1>Track activity</h1>
      <p>Record a run or walk with a private GPS route and a saved activity summary.</p>
    </header>
    <label className={styles.type}>Activity type <select value={current ? current.task.kind : summary ? summary.task.kind : selection} disabled={Boolean(current) || disabled || anotherActivity} onChange={event => { setSelection(event.target.value as "run" | "walk"); setSummary(null); setNotice(""); }}><option value="walk">Walk</option><option value="run">Run</option></select></label>
    <p className={styles.hint}>{current ? "Activity type is locked until you finish or cancel." : "Choose your activity before starting."}</p>
    {anotherActivity && <p role="status" className={styles.banner}>You already have {activity?.task.name} in progress. <Link href="/tasks">Finish or cancel that activity</Link> before starting a run or walk.</p>}
    <div className={styles.foregroundNote}>GPS records only while this page is visible. Keep your screen on for route coverage. Hidden pages, GPS loss, and network outages leave gaps; the server timer keeps running until you save a pause or finish. Standing still does not pause your timer.</div>
    <RouteMap key={routeSessionId ?? "ready"} points={tracking.route.points} />
    <p role="status" className={styles.gpsStatus}>{current?.state === "paused" ? "Paused. GPS is off; paused time and movement do not count." : summary && !current ? "Saved route. Missing GPS coverage stays a gap." : current ? tracking.status : "GPS is off. Starting an activity requests location access."}</p>
    {current?.state === "running" && <button className={styles.retryGps} type="button" disabled={disabled} onClick={tracking.retryGps}>Retry GPS</button>}
    {tracking.loading && <p role="status" className={styles.hint}>Loading the saved route before GPS collection…</p>}
    {tracking.error && <p role="alert" className={styles.error}>{tracking.error} <button type="button" disabled={disabled} onClick={tracking.retryGps}>Reload route</button></p>}
    <dl className={styles.stats}>
      <div><dt>Distance</dt><dd>{(distanceM / 1000).toFixed(2)}<small> km</small></dd></div>
      <div><dt>Active time</dt><dd data-testid="activity-timer">{formatDuration(activeMs)}</dd></div>
      <div><dt>Average pace</dt><dd className={styles.pace}>{formatPace(distanceM, activeMs)}<small> /km</small></dd></div>
      <div><dt>{summary && !current ? "Tokens earned" : "Tokens on completion"}</dt><dd>{summary && !current ? summary.tokenAward : Math.floor(activeMs / 1_800_000)}</dd></div>
    </dl>
    <details className={styles.verification}>
      <summary>Activity and reward details <span aria-hidden="true">⌄</span></summary>
      <div><p>One token per full 30 minutes of server-measured running time in a completed session. Manual pauses do not count. Unused minutes are discarded per session. GPS coverage does not determine your timer reward.</p><dl><div><dt>GPS fixes saved</dt><dd>{tracking.route.coverage.pointCount}</dd></div><div><dt>Route segments</dt><dd>{tracking.route.coverage.segmentCount}</dd></div><div><dt>Location privacy</dt><dd>Only your account can read this route.</dd></div></dl><p>Fixes with accuracy worse than 50 m, impossible jumps, stale timestamps, or missing coverage are excluded from distance. Small GPS jitter is filtered. Maps use OpenFreeMap; tile availability does not control recording.</p></div>
    </details>
    {current && <div className={styles.notes}>
      <label>Activity notes (optional)<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} disabled={disabled} rows={2} /></label>
      {current.task.reflectionQuestion && <label>{current.task.reflectionQuestion}<textarea maxLength={4000} value={reflection} onChange={event => setReflection(event.target.value)} disabled={disabled} rows={2} required /></label>}
    </div>}
    {!current && <button className={styles.start} type="button" disabled={disabled || anotherActivity || !data} onClick={() => void start()}>Start {summary ? "another activity" : activityName.toLowerCase()}</button>}
    {current && <>
      <div className={styles.controls}>
        <button className={styles.primary} type="button" disabled={disabled} onClick={() => void control(current.state === "paused" ? "resume" : "pause")}>{current.state === "paused" ? "Resume activity" : "Pause activity"}</button>
        <button type="button" disabled={disabled || Boolean(current.task.reflectionQuestion && !reflection.trim())} onClick={() => void control("complete")}>Finish and save</button>
      </div>
      <details className={styles.cancel}><summary>Discard activity</summary><p>Discarding keeps no completion and awards no tokens.</p><button type="button" disabled={disabled} onClick={() => void control("cancel")}>Confirm discard</button></details>
    </>}
    {saving && <p role="status" className={styles.hint}>Saving your activity…</p>}
    {notice && <p role="status" className={error ? styles.error : styles.notice}>{notice}</p>}
    {summary && !current && <div className={styles.savedSummary}><h2>{activityName} saved</h2><p>{formatDuration(summary.eligibleMs)} active · {(distanceM / 1000).toFixed(2)} km · {summary.tokenAward} tokens earned</p><Link href="/history">View activity history →</Link></div>}
  </div>;
}
