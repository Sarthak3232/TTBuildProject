"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity } from "@/domain/activity";
import { api } from "@/features/app/client";
import { rejectFix, ROUTE_LIMITS, type RouteFix, type RouteIngestion, type SavedRoute } from "@/domain/time/route";

const emptyRoute = (): SavedRoute => ({ points: [], distanceM: 0, nextSequence: 0, serverTime: new Date().toISOString(), coverage: { pointCount: 0, segmentCount: 0, lastCapturedAt: null } });

export function useRouteTracker(sessionId: string | null, activity: Activity | null, online: boolean) {
  const [record, setRecord] = useState<{ id: string; route: SavedRoute } | null>(null);
  const [status, setStatus] = useState("GPS starts with your activity.");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [readyId, setReadyId] = useState<string | null>(null);
  const nextSequence = useRef(0);
  const queue = useRef<RouteFix[]>([]);
  const gap = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const watchStop = useRef<() => void>(() => {});
  const suspended = useRef(false);
  const selectedSession = useRef(sessionId);
  const loadKey = `${sessionId}:${retry}`;
  const runningRevision = activity?.state === "running" && activity.id === sessionId ? activity.revision : null;

  useEffect(() => {
    selectedSession.current = sessionId;
    suspended.current = false;
    queue.current = [];
    nextSequence.current = 0;
    gap.current = true;
    let disposed = false;
    if (!sessionId) return;
    const load = async () => {
      // Restore the cursor after an earlier upload has finished committing.
      await inFlight.current;
      return api<SavedRoute>(`/api/sessions/${sessionId}/route`, { signal: AbortSignal.timeout(10_000) });
    };
    void load().then(route => {
      if (disposed) return;
      nextSequence.current = route.nextSequence;
      setRecord({ id: sessionId, route });
      setReadyId(`${sessionId}:${retry}`);
      setError("");
    }).catch((cause: Error) => { if (!disposed) { setReadyId(null); setError(`Saved GPS route could not be loaded: ${cause.message}`); } });
    return () => { disposed = true; watchStop.current(); };
  }, [sessionId, retry]);

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    if (!sessionId || selectedSession.current !== sessionId || runningRevision === null || !queue.current.length) return;
    const batch = queue.current.splice(0, ROUTE_LIMITS.batchSize);
    const hadGap = gap.current;
    gap.current = false;
    const task = (async () => {
      try {
        const response = await api<RouteIngestion>(`/api/sessions/${sessionId}/route`, { method: "POST", signal: AbortSignal.timeout(10_000), body: JSON.stringify({ revision: runningRevision, points: batch, gap: hadGap }) });
        if (selectedSession.current !== sessionId) return;
        nextSequence.current = Math.max(nextSequence.current, response.nextSequence);
        setRecord(previous => ({ id: sessionId, route: {
          ...response,
          points: [...new Map([...(previous?.id === sessionId ? previous.route.points : []), ...response.points].map(point => [point.sequence, point])).values()].sort((a, b) => a.sequence - b.sequence),
        } }));
        if (response.rejected) {
          gap.current = true;
          setStatus(`GPS coverage gap: ${response.rejected} invalid or late fixes were excluded. Timer continues.`);
        }
        if (response.reasons.capacity) {
          suspended.current = true;
          watchStop.current();
          setStatus("GPS storage limit reached for this activity. Collection stopped; your server timer continues. Finish and save when ready.");
        }
        setError("");
      } catch (cause) {
        if (selectedSession.current !== sessionId) return;
        // Never backfill an unobserved/offline gap with stale coordinates.
        gap.current = true;
        queue.current = [];
        setError(`GPS route upload interrupted: ${(cause as Error).message}. Your server timer continues.`);
      }
    })();
    inFlight.current = task;
    await task;
    if (inFlight.current === task) inFlight.current = null;
  }, [sessionId, runningRevision]);

  useEffect(() => {
    let disposed = false;
    let clear: (() => void) | null = null;
    let releaseLock: (() => void) | null = null;
    const stop = () => { clear?.(); clear = null; releaseLock?.(); releaseLock = null; gap.current = true; };
    watchStop.current = stop;
    const begin = () => {
      if (disposed || suspended.current || runningRevision === null || !sessionId || readyId !== loadKey || !online || document.visibilityState !== "visible") return;
      if (!navigator.geolocation) { setStatus("Location is unavailable in this browser. Your timer still runs; distance stays unmeasured."); return; }
      if (!window.isSecureContext) { setStatus("GPS needs HTTPS or localhost. Your timer still runs; distance stays unmeasured."); return; }
      const collect = () => {
        if (disposed || suspended.current || document.visibilityState !== "visible") return;
        setStatus("Acquiring GPS… Keep this page visible.");
        let previous: RouteFix | null = null;
        let lastSample = 0;
        let closed = false;
        const watch = navigator.geolocation.watchPosition(position => {
          if (closed || disposed || suspended.current || document.visibilityState !== "visible") return;
          if (!Number.isFinite(position.timestamp) || position.timestamp - lastSample < 1000) return;
          lastSample = position.timestamp;
          const fix: RouteFix = { sequence: nextSequence.current++, capturedAt: new Date(position.timestamp).toISOString(), lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy };
          const rejection = rejectFix(fix, previous, Date.now());
          if (rejection) {
            gap.current = true;
            previous = null;
            setStatus(`GPS fix excluded (${rejection}). Waiting for an accurate, fresh position. Timer continues.`);
            return;
          }
          previous = fix;
          if (queue.current.length >= ROUTE_LIMITS.batchSize) { queue.current.shift(); gap.current = true; }
          queue.current.push(fix);
          setStatus(`GPS recording · accuracy ±${Math.round(fix.accuracyM)} m`);
        }, locationError => {
          if (closed || disposed) return;
          gap.current = true;
          previous = null;
          const message = locationError.code === 1 ? "Location permission denied. Enable it in your browser settings and retry GPS." : locationError.code === 2 ? "Location is unavailable. Waiting for GPS to return." : "GPS timed out. Waiting for a fresh location.";
          setStatus(`${message} Your timer continues; no distance is invented.`);
          if (locationError.code === 1) stop();
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
        const interval = window.setInterval(() => { void flush(); }, 2500);
        clear = () => { closed = true; navigator.geolocation.clearWatch(watch); window.clearInterval(interval); };
      };
      if (navigator.locks) {
        void navigator.locks.request(`slotty-gps-${sessionId}`, { ifAvailable: true }, async lock => {
          if (!lock) { if (!disposed) setStatus("GPS is being recorded in another tab. Your timer is shared across tabs."); return; }
          if (disposed || suspended.current) return;
          await new Promise<void>(resolve => { releaseLock = resolve; collect(); });
        });
      } else collect();
    };
    const visibility = () => {
      stop();
      if (document.visibilityState === "visible") begin();
      else setStatus("Page hidden: GPS collection stopped. The server timer continues; missing route coverage stays a gap.");
    };
    // A microtask avoids updates during effect setup and lets teardown cancel a start.
    queueMicrotask(begin);
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; stop(); document.removeEventListener("visibilitychange", visibility); };
  }, [sessionId, runningRevision, readyId, online, flush, loadKey]);

  const stopAndFlush = async () => {
    suspended.current = true;
    const pendingGap = gap.current;
    watchStop.current();
    gap.current = pendingGap;
    await flush();
    gap.current = true;
  };
  const retryGps = () => { suspended.current = false; setRetry(value => value + 1); };

  return {
    route: record?.id === sessionId ? record.route : emptyRoute(),
    loading: Boolean(sessionId && readyId !== loadKey), status, error,
    stopAndFlush, retryGps,
  };
}
