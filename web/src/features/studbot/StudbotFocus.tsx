"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./studbot.module.css";
import { formatStudyTime, savedStudyTiming } from "./study-clock";
import { mutation } from "@/features/app/client";
import type { StudyProgress } from "@/server/services/studbot";

type Stage = "preview" | "screen" | "ready" | "studying" | "paused";
type Diagnostics = { faceCount: number; bodyPresent: boolean; orientationAvailable: boolean; imageUsable: boolean; reasons: string[] };
type Reply = { phase?: string; usable?: boolean; samples?: number; seconds?: number;
  state?: "compatible" | "away" | "unknown"; reason?: string; error?: string; diagnostics?: Diagnostics; progress?: StudyProgress };
const diagnosticMessages: Record<string, string> = {
  image_unusable: "Image quality checks failed.",
  image_too_small: "The image is too small to verify reliably.",
  image_too_dark: "The image is too dark. Add lighting toward your face.",
  image_too_bright: "The image is too bright or washed out.",
  image_low_contrast: "The image has too little contrast; the camera may be covered or the lighting too flat.",
  face_not_detected: "No face was detected. Raise or tilt your book toward the screen, or lower the camera so it can see more of your face. Keep your shoulders in view.",
  multiple_faces: "Other faces are visible. Studbot follows the prominent person near the center.",
  multiple_bodies: "More than one body was detected.",
  invalid_body_landmarks: "The body landmarks could not be verified.",
  shoulders_unreliable: "The body check could not verify both shoulders. This can reject a frame even when face orientation is available.",
  incomplete_face_landmarks: "A face was detected, but the full facial landmark set was not available.",
  invalid_face_landmarks: "The face landmarks contained invalid measurements.",
  face_transform_missing: "A face was detected, but its orientation transform was missing.",
  face_orientation_unreliable: "A face was detected, but a reliable head angle could not be calculated.",
  ambiguous_observation: "The detected view was ambiguous.",
};
class FocusError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function mobileDevice() {
  // Include iPadOS browsers that advertise a desktop Mac user agent. A small
  // window alone must not change desktop behavior while studying in split view.
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Camera permission was denied. Allow camera access and open focus mode again.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No camera was found on this device.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "The camera is unavailable. Close other camera applications and try again.";
  return error instanceof Error ? error.message : "Could not open focus mode. Please try again.";
}

async function frameBlob(video: HTMLVideoElement): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Camera image capture is unavailable in this browser.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 256 * 1024) return { blob, width: canvas.width, height: canvas.height };
    }
    throw new Error("Could not create an image within the frame size limit.");
  } finally { canvas.width = 0; canvas.height = 0; }
}

export function StudbotFocus() {
  const [open, setOpen] = useState(false);
  const progressRef = useRef<{ progress: StudyProgress; receivedAt: number } | null>(null);
  const [saved, setSaved] = useState<StudyProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [timing, setTiming] = useState({ elapsedMs: 0, running: false });
  const [starting, setStarting] = useState(false);
  const [stage, setStage] = useState<Stage>("preview");
  const [message, setMessage] = useState("Open focus mode to connect your camera to Studbot.");
  const [result, setResult] = useState<{ state: string; reason: string } | null>(null);
  const [progress, setProgress] = useState({ samples: 0, seconds: 0 });
  const [cameraOn, setCameraOn] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [cameraInfo, setCameraInfo] = useState<{ width: number; height: number; fps?: number } | null>(null);
  const [sentSize, setSentSize] = useState<{ width: number; height: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const lastResult = useRef(0);
  const stopping = useRef<Promise<unknown>>(Promise.resolve());

  const updateProgress = useCallback((progress: StudyProgress | undefined) => {
    if (!progress) return;
    const old = progressRef.current?.progress;
    const stamp = progress.serverTime ?? progress.activity?.serverTime;
    const previousStamp = old?.serverTime ?? old?.activity?.serverTime;
    if (stamp && previousStamp && Date.parse(stamp) < Date.parse(previousStamp)) return;
    progressRef.current = { progress, receivedAt: performance.now() };
    setSaved(progress);
    setTiming(savedStudyTiming(progress.activity, 0));
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch("/api/studbot/session", { cache: "no-store" });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error?.message ?? "Saved study progress could not be loaded.");
        if (!disposed) updateProgress(value);
      } catch (error) { if (!disposed) setMessage(friendlyError(error)); }
    };
    void load();
    const poll = !open ? setInterval(() => void load(), 15000) : undefined;
    return () => { disposed = true; clearInterval(poll); };
  }, [open, updateProgress]);

  const release = useCallback(() => {
    setTiming(previous => ({ ...previous, running: false }));
    generation.current++;
    abort.current?.abort();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const stopSession = useCallback(() => {
    stopping.current = fetch("/api/studbot/stop", { method: "POST", keepalive: true }).then(async response => {
      const value: Reply = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Pause could not be confirmed.");
      updateProgress(value.progress);
    }).catch(() => { setMessage("Pause could not be confirmed. Saved progress is retained; counting stops after at most five seconds without new results."); });
    return stopping.current;
  }, [updateProgress]);

  const close = useCallback((notice = "Focus mode closed. Camera and uploads stopped.") => {
    release(); stopSession();
    setOpen(false); setStarting(false); setCameraOn(false); setResult(null); setStage("preview"); setMessage(notice);
    setDiagnostics(null); setCameraInfo(null); setSentSize(null);
    dialog.current?.close();
  }, [release, stopSession]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden && mobileDevice()) close("Focus mode closed because the mobile app was hidden. Reopen it to recalibrate.");
    };
    const leaving = () => close("Focus mode closed because you left the page.");
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      release(); stopSession();
    };
  }, [close, release, stopSession]);

  const api = useCallback(async (action: string, signal: AbortSignal, body?: Blob): Promise<Reply> => {
    const response = await fetch(`/api/studbot/${action}`, { method: "POST", signal,
      ...(body ? { headers: { "Content-Type": "image/jpeg" }, body } : {}) });
    const data: Reply = await response.json();
    if (!response.ok) throw new FocusError(response.status, data.error ?? "Classifier request failed.");
    if (!signal.aborted) updateProgress(data.progress);
    return data;
  }, [updateProgress]);

  async function camera(ticket: number) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs localhost or HTTPS and a supported browser.");
    const captured = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    if (ticket !== generation.current || (document.hidden && mobileDevice())) { captured.getTracks().forEach(track => track.stop()); return false; }
    stream.current = captured;
    captured.getVideoTracks().forEach(track => track.addEventListener("ended", () => close("The camera disconnected. Reopen focus mode to try again."), { once: true }));
    if (video.current) { video.current.srcObject = captured; await video.current.play(); }
    if (ticket !== generation.current) { captured.getTracks().forEach(track => track.stop()); return false; }
    const settings = captured.getVideoTracks()[0]?.getSettings();
    setCameraInfo({ width: video.current?.videoWidth || settings?.width || 0,
      height: video.current?.videoHeight || settings?.height || 0, fps: settings?.frameRate });
    setCameraOn(true);
    return true;
  }

  async function begin() {
    setStarting(true); setOpen(true); setStage("preview"); setProgress({ samples: 0, seconds: 0 }); setResult(null);
    setDiagnostics(null); setCameraInfo(null); setSentSize(null);
    setMessage("Connecting to the classifier…");
    const ticket = ++generation.current;
    const controller = new AbortController(); abort.current = controller;
    try {
      await stopping.current;
      await api("open", controller.signal);
      if (ticket !== generation.current) return;
      if (await camera(ticket)) setMessage("Camera ready. Face your screen, then select Calibrate screen.");
    } catch (error) {
      if (ticket === generation.current) close(friendlyError(error));
    } finally { if (ticket === generation.current) setStarting(false); }
  }

  async function reset() {
    setTiming(previous => ({ ...previous, running: false }));
    generation.current++; abort.current?.abort(); setStage("preview"); setResult(null); setProgress({ samples: 0, seconds: 0 });
    setDiagnostics(null);
    const controller = new AbortController(); abort.current = controller;
    try { await api("reset", controller.signal); setMessage("Face your screen and start calibration again."); }
    catch (error) { if (!controller.signal.aborted) setMessage(friendlyError(error)); }
  }

  async function pause() {
    release(); setCameraOn(false); setStage("paused"); setResult(null); setMessage("Paused. Camera and uploads are stopped.");
    setCameraInfo(null); setSentSize(null);
    setStarting(true);
    try { await api("pause", new AbortController().signal); }
    catch (error) { setMessage(friendlyError(error)); }
    finally { setStarting(false); }
  }

  async function startStudying() {
    const controller = new AbortController(); abort.current = controller;
    setStarting(true);
    try {
      await api("start", controller.signal);
      if (!controller.signal.aborted) { setResult(null); setStage("studying"); return true; }
      return false;
    } catch (error) { if (!controller.signal.aborted) setMessage(friendlyError(error)); return false; }
    finally { setStarting(false); }
  }

  async function finishSession(action: "complete" | "cancel") {
    const id = progressRef.current?.progress.activity?.id;
    if (!id || saving) return;
    setSaving(true);
    close("Saving your study session…");
    try {
      await stopping.current;
      const progress = await mutation<StudyProgress>("/api/studbot/session", { action, sessionId: id });
      updateProgress(progress);
      window.dispatchEvent(new Event("slotty:activity-updated"));
      setMessage(action === "complete" ? `Study session saved. Earned ${progress.completion?.tokenAward ?? 0} tokens.` : "Study session discarded. No tokens awarded.");
    } catch (error) { setMessage(friendlyError(error)); }
    finally { setSaving(false); }
  }

  async function resume() {
    const ticket = ++generation.current;
    setStarting(true);
    try { if (await camera(ticket)) {
      if (await startStudying()) setMessage("Studying. Waiting for a fresh classification.");
      else { release(); setCameraOn(false); }
    } }
    catch (error) { if (ticket === generation.current) setMessage(friendlyError(error)); }
    finally { if (ticket === generation.current) setStarting(false); }
  }

  useEffect(() => {
    if (!open || !["screen", "studying"].includes(stage)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const ticket = generation.current;
    async function tick() {
      try {
        const frame = video.current ? await frameBlob(video.current) : null;
        if (cancelled || ticket !== generation.current) return;
        if (frame) {
          setSentSize({ width: frame.width, height: frame.height });
          controller = new AbortController(); abort.current = controller;
          const data = await api(stage === "studying" ? "classify" : stage, controller.signal, frame.blob);
          if (cancelled || ticket !== generation.current) return;
          if (stage === "studying") {
            lastResult.current = Date.now();
            setResult({ state: data.state ?? "unknown", reason: data.reason?.replaceAll("_", " ") ?? "Unable to verify" });
          } else {
            setDiagnostics(data.diagnostics ?? null);
            setProgress({ samples: data.samples ?? 0, seconds: data.seconds ?? 0 });
            if (data.phase === "book" && stage === "screen") {
              await api("finish", controller.signal);
              if (cancelled || ticket !== generation.current) return;
              setStage("ready"); setMessage("Ready. Facing forward and looking down both count. Select Start studying."); return;
            }
            if (data.phase === "ready") {
              setStage("ready"); setMessage("Ready. You can start studying."); return;
            }
            setMessage(data.usable ? "Hold this position while usable samples are collected."
              : data.samples ? "Detection briefly lost. Recent valid samples are kept for up to three seconds; bring your face back into view."
              : "Unable to verify this view. Improve lighting and keep your head and shoulders near the center.");
          }
        }
      } catch (error) {
        if (cancelled || ticket !== generation.current) return;
        setResult({ state: "unknown", reason: "No verified result" });
        setMessage(friendlyError(error));
        if (error instanceof FocusError && error.status === 409) {
          setTiming(previous => ({ ...previous, running: false }));
          setStage("preview"); return;
        }
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    }
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); controller?.abort(); };
  }, [open, stage, api]);

  useEffect(() => {
    if (stage !== "studying") return;
    const interval = setInterval(() => {
      const anchor = progressRef.current;
      if (anchor) setTiming(savedStudyTiming(anchor.progress.activity, performance.now() - anchor.receivedAt));
      if (Date.now() - lastResult.current > 3000) setResult({ state: "unknown", reason: "Waiting for a fresh result" });
    }, 250);
    return () => clearInterval(interval);
  }, [stage]);

  const rewardIntervalMs = saved?.activity ? saved.activity.rewardIntervalMs ?? 1800000 : saved?.testRewards ? 15000 : 1800000;
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>STUD BOT</h1><span className={styles.badge}>LIVE CLASSIFIER</span></div><p>SLOTTY / FOCUS</p></header>
    <section className={styles.session}>
      <h2>Your space to focus</h2>
      <p className={styles.description}>Calibrate once facing the screen. Your timer runs while you face forward or look down, and pauses when you turn away or leave.</p>
      <p className={styles.description}>Sampled images are sent securely to the classifier for analysis and discarded. Your microphone is never requested.</p>
      <button type="button" className={styles.focusButton} onClick={begin} disabled={starting || open || saving}>Open focus mode</button>
      <p role="status" className={styles.description}>{message}</p>
      <p className={styles.description}>Other people may be in view. Keep yourself near the center with your head and shoulders visible.</p>
      <div className={styles.timer}><strong aria-label="Study time">{formatStudyTime(timing.elapsedMs)}</strong><span>{timing.running ? "Timer running" : "Timer paused"}</span></div>
      <p className={styles.description}>Progress is saved to your account. Finish and save to earn one token per full {rewardIntervalMs === 15000 ? "15 seconds (test rate)" : "30 minutes"}. Leftover time does not carry between completed sessions.</p>
      {saved?.testRewards && <p role="status" className={styles.description}>Test rewards enabled: new Studbot sessions earn one token per 15 seconds. These credits affect your actual token balance. Existing sessions keep the rate they started with.</p>}
      {saved?.activity && ["running", "paused"].includes(saved.activity.state) && <div className={styles.focusControls}>
        <button type="button" disabled={saving} onClick={() => void finishSession("complete")}>Finish &amp; save</button>
        <button type="button" disabled={saving} onClick={() => void finishSession("cancel")}>Discard study session</button>
        <p>{Math.floor(timing.elapsedMs / rewardIntervalMs)} tokens on completion. Close focus mode to pause and resume later.</p>
      </div>}
    </section>
    <dialog ref={dialog} className={styles.focusDialog} aria-labelledby="focus-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className={styles.dialogHeader}><h2 id="focus-title">Focus mode</h2><button type="button" onClick={() => close()} aria-label="Close focus mode">Close</button></div>
      <div className={styles.timer}><strong aria-label="Focus session time">{formatStudyTime(timing.elapsedMs)}</strong><span>{timing.running ? "Timer running" : "Timer paused"}</span></div>
      <div className={styles.feed}>
        <video ref={video} autoPlay muted playsInline className={styles.liveVideo} aria-label="Your live camera preview" />
        {!cameraOn && <div className={styles.off}>{starting ? "Connecting camera…" : "Camera off"}</div>}
      </div>
      {cameraOn && cameraInfo && <p className={styles.description}>
        Camera capture: {cameraInfo.width} × {cameraInfo.height}{cameraInfo.fps ? ` at ${Math.round(cameraInfo.fps)} fps` : ""}.
        {sentSize && <> Sent JPEG: {sentSize.width} × {sentSize.height} (sampled about once per second).</>}
      </p>}
      <div className={styles.liveResult} data-state={result?.state ?? "unknown"} role="status" aria-live="polite">
        <strong>{stage === "studying" ? result?.state ?? "unknown" : stage === "paused" ? "Paused" : "Calibration"}</strong>
        <span>{stage === "studying" ? result?.reason ?? "Waiting for a fresh result" : message}</span>
      </div>
      {stage === "screen" && <div className={styles.calibrationProgress}>
        <label htmlFor="calibration-progress">Screen: {progress.seconds.toFixed(1)} / 5 seconds · {progress.samples} usable samples</label>
        <progress id="calibration-progress" max={5} value={progress.seconds} />
      </div>}
      {stage === "screen" && <section className={styles.diagnostics} aria-labelledby="calibration-diagnostics-title">
        <h3 id="calibration-diagnostics-title">Last calibration frame</h3>
        {diagnostics ? <>
          <p>Image quality: {diagnostics.imageUsable ? "passed" : "failed"} · Faces detected: {diagnostics.faceCount} · Head angle: {diagnostics.orientationAvailable ? "available" : "unavailable"} · Upper body: {diagnostics.bodyPresent ? "verified" : "not verified"}</p>
          {!diagnostics.imageUsable && <p>Face and body detection were skipped because the image-quality checks failed.</p>}
          {diagnostics.reasons.length ? <ul>{diagnostics.reasons.map(reason => <li key={reason}>{diagnosticMessages[reason] ?? "This observation could not be verified."}</li>)}</ul>
            : <p>This frame passed the calibration checks.</p>}
        </> : <p>Waiting for diagnostics. If frames arrive but this stays empty, restart FastAPI with the updated code.</p>}
      </section>}
      <div className={styles.focusControls}>
        {stage === "preview" && <button type="button" disabled={!cameraOn || starting} onClick={() => { setProgress({ samples: 0, seconds: 0 }); setStage("screen"); }}>Calibrate screen</button>}
        {stage === "ready" && <button type="button" disabled={starting} onClick={() => void startStudying()}>Start studying</button>}
        {stage === "studying" && <button type="button" onClick={() => void pause()}>Pause camera</button>}
        {stage === "paused" && <button type="button" disabled={starting} onClick={resume}>Resume studying</button>}
        {cameraOn && stage !== "preview" && <button type="button" onClick={reset}>Recalibrate</button>}
        <button type="button" onClick={() => close()}>End focus mode</button>
        {saved?.activity && ["running", "paused"].includes(saved.activity.state) && <button type="button" disabled={saving} onClick={() => void finishSession("complete")}>Finish &amp; save</button>}
      </div>
      <p className={styles.description}>Forward or downward posture counts. Looking away or uncertain results gets five seconds of credited grace, then pauses; two seconds of valid posture resumes. Lost camera updates also receive at most five seconds of grace.</p>
      <p className={styles.description}>Desktop tab switching keeps focus mode running. On mobile, switching away pauses and saves your progress. Closing focus mode or leaving this page also preserves your session; reopen and recalibrate to resume it.</p>
      <p className={styles.description}>This estimates posture, not attention, and cannot distinguish another person taking your seat.</p>
    </dialog>
  </div>;
}
