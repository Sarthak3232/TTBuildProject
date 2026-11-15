"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./studbot.module.css";

type Stage = "preview" | "screen" | "book-prompt" | "book" | "ready" | "studying" | "paused";
type Diagnostics = { faceCount: number; bodyPresent: boolean; orientationAvailable: boolean; imageUsable: boolean; reasons: string[] };
type Reply = { phase?: string; usable?: boolean; samples?: number; seconds?: number;
  state?: "compatible" | "away" | "unknown"; reason?: string; error?: string; diagnostics?: Diagnostics };
const diagnosticMessages: Record<string, string> = {
  image_unusable: "Image quality checks failed.",
  image_too_small: "The image is too small to verify reliably.",
  image_too_dark: "The image is too dark. Add lighting toward your face.",
  image_too_bright: "The image is too bright or washed out.",
  image_low_contrast: "The image has too little contrast; the camera may be covered or the lighting too flat.",
  face_not_detected: "No face was detected. Raise or tilt your book toward the screen, or lower the camera so it can see more of your face. Keep your shoulders in view.",
  multiple_faces: "More than one face was detected. Keep a single person in view.",
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

  const release = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const stopSession = useCallback(() => {
    stopping.current = fetch("/api/studbot/stop", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

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
    const hidden = () => { if (document.hidden) close("Focus mode closed because the page was hidden. Reopen it to recalibrate."); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); release(); stopSession(); };
  }, [close, release, stopSession]);

  async function api(action: string, signal: AbortSignal, body?: Blob): Promise<Reply> {
    const response = await fetch(`/api/studbot/${action}`, { method: "POST", signal,
      ...(body ? { headers: { "Content-Type": "image/jpeg" }, body } : {}) });
    const data: Reply = await response.json();
    if (!response.ok) throw new FocusError(response.status, data.error ?? "Classifier request failed.");
    return data;
  }

  async function camera(ticket: number) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs localhost or HTTPS and a supported browser.");
    const captured = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    if (ticket !== generation.current || document.hidden) { captured.getTracks().forEach(track => track.stop()); return false; }
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
    generation.current++; abort.current?.abort(); setStage("preview"); setResult(null); setProgress({ samples: 0, seconds: 0 });
    setDiagnostics(null);
    const controller = new AbortController(); abort.current = controller;
    try { await api("reset", controller.signal); setMessage("Face your screen and start calibration again."); }
    catch (error) { if (!controller.signal.aborted) setMessage(friendlyError(error)); }
  }

  function pause() {
    release(); setCameraOn(false); setStage("paused"); setResult(null); setMessage("Paused. Camera and uploads are stopped.");
    setCameraInfo(null); setSentSize(null);
  }

  async function resume() {
    const ticket = ++generation.current;
    setStarting(true);
    try { if (await camera(ticket)) { setStage("studying"); setMessage("Studying. Waiting for a fresh classification."); } }
    catch (error) { if (ticket === generation.current) setMessage(friendlyError(error)); }
    finally { if (ticket === generation.current) setStarting(false); }
  }

  useEffect(() => {
    if (!open || !["screen", "book", "studying"].includes(stage)) return;
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
              setStage("book-prompt"); setMessage("Screen calibrated. Raise or tilt your book so your face stays visible while reading, then select Calibrate book. If you move the camera, recalibrate both positions."); return;
            }
            if (data.phase === "ready") {
              setStage("ready"); setMessage("Both positions calibrated. You can start studying."); return;
            }
            setMessage(data.usable ? "Hold this position while usable samples are collected."
              : data.samples ? "Detection briefly lost. Recent valid samples are kept for up to three seconds; bring your face back into view."
              : "Unable to verify this view. Improve lighting and keep one face and your shoulders visible.");
          }
        }
      } catch (error) {
        if (cancelled || ticket !== generation.current) return;
        setResult({ state: "unknown", reason: "No verified result" });
        setMessage(friendlyError(error));
        if (error instanceof FocusError && error.status === 409) { setStage("preview"); return; }
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    }
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); controller?.abort(); };
  }, [open, stage]);

  useEffect(() => {
    if (stage !== "studying") return;
    const interval = setInterval(() => {
      if (Date.now() - lastResult.current > 3000) setResult({ state: "unknown", reason: "Waiting for a fresh result" });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  return <div className={styles.page}>
    <header className={styles.header}><div><h1>STUD BOT</h1><span className={styles.badge}>LIVE CLASSIFIER</span></div><p>SLOTTY / FOCUS</p></header>
    <section className={styles.session}>
      <h2>Your space to focus</h2>
      <p className={styles.description}>Calibrate your screen and reading positions, then see live study-position feedback from your camera.</p>
      <p className={styles.description}>Sampled images are sent securely to the classifier for analysis and discarded. Your microphone is never requested.</p>
      <button type="button" className={styles.focusButton} onClick={begin} disabled={starting || open}>Open focus mode</button>
      <p role="status" className={styles.description}>{message}</p>
      <p className={styles.description}>Study time, history, and token credit are not saved in this version.</p>
    </section>
    <dialog ref={dialog} className={styles.focusDialog} aria-labelledby="focus-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className={styles.dialogHeader}><h2 id="focus-title">Focus mode</h2><button type="button" onClick={() => close()} aria-label="Close focus mode">Close</button></div>
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
      {(stage === "screen" || stage === "book") && <div className={styles.calibrationProgress}>
        <label htmlFor="calibration-progress">{stage === "screen" ? "Screen" : "Book"}: {progress.seconds.toFixed(1)} / 5 seconds · {progress.samples} usable samples</label>
        <progress id="calibration-progress" max={5} value={progress.seconds} />
      </div>}
      {(stage === "screen" || stage === "book") && <section className={styles.diagnostics} aria-labelledby="calibration-diagnostics-title">
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
        {stage === "book-prompt" && <button type="button" onClick={() => { setProgress({ samples: 0, seconds: 0 }); setStage("book"); }}>Calibrate book</button>}
        {stage === "ready" && <button type="button" onClick={() => { setResult(null); setStage("studying"); }}>Start studying</button>}
        {stage === "studying" && <button type="button" onClick={pause}>Pause camera</button>}
        {stage === "paused" && <button type="button" disabled={starting} onClick={resume}>Resume studying</button>}
        {cameraOn && stage !== "preview" && <button type="button" onClick={reset}>Recalibrate</button>}
        <button type="button" onClick={() => close()}>End focus mode</button>
      </div>
      <p className={styles.description}>Keep the camera fixed. Reading and writing can qualify after calibration. Results describe head position, not eye gaze or proof of attention.</p>
      <p className={styles.description}>Closing this window, leaving the page, or hiding the tab stops the camera. This connection displays individual classifications; automatic study-time accounting comes later.</p>
    </dialog>
  </div>;
}
