"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatPace, type SavedRoute } from "@/domain/time/route";
import { api } from "@/features/app/client";
import { RouteMap } from "./RouteMap";
import styles from "./tracking.module.css";

/** Read-only owner-protected route for a history entry or saved summary. */
export function SavedActivityRoute({ sessionId }: { sessionId: string }) {
  const [route, setRoute] = useState<SavedRoute | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    void api<SavedRoute>(`/api/sessions/${sessionId}/route`, { signal: AbortSignal.timeout(10_000) }).then(result => {
      if (!disposed) { setRoute(result); setError(""); }
    }).catch((cause: Error) => { if (!disposed) setError(cause.message); });
    return () => { disposed = true; };
  }, [sessionId, retry]);
  if (error) return <p role="alert">Could not load saved route: {error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry route</button></p>;
  if (!route) return <p role="status">Loading saved route…</p>;
  return <div className={styles.savedRoute}>
    {route.completion && <section className={styles.savedSummary} aria-label="Saved activity summary"><h2>{route.completion.task.name}</h2><p>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: route.completion.timezone }).format(new Date(route.completion.completedAt))}</p><p>{formatDuration(route.completion.eligibleMs)} active · {(route.distanceM / 1000).toFixed(2)} km · {formatPace(route.distanceM, route.completion.eligibleMs)} /km · {route.completion.tokenAward} tokens earned</p>{route.completion.description && <p>{route.completion.description}</p>}{route.completion.reflection && <p>{route.completion.reflection}</p>}</section>}
    <RouteMap points={route.points} />
    <p className={styles.hint}>{(route.distanceM / 1000).toFixed(2)} km · {route.coverage.pointCount} GPS fixes · {route.coverage.segmentCount} route segments. Gaps are not filled in.</p>
  </div>;
}
