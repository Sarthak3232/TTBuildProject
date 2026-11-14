import type { Completion } from "@/domain/activity";

/** GPS coverage is independent of the server-owned activity/reward clock. */
export const ROUTE_LIMITS = {
  batchSize: 100,
  maxPoints: 25_000,
  maxAccuracyM: 50,
  maxAgeMs: 15_000,
  maxGapMs: 15_000,
  maxSpeedMps: 12,
} as const;

export interface RouteFix {
  sequence: number;
  capturedAt: string;
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface RoutePoint extends RouteFix {
  segmentId: number;
}

export interface RouteCoverage {
  pointCount: number;
  segmentCount: number;
  lastCapturedAt: string | null;
}

export interface SavedRoute {
  points: RoutePoint[];
  distanceM: number;
  coverage: RouteCoverage;
  nextSequence: number;
  serverTime: string;
  completion?: Completion | null;
}

export interface RouteIngestion extends Omit<SavedRoute, "points"> {
  accepted: number;
  rejected: number;
  duplicates: number;
  reasons: Record<string, number>;
  points: RoutePoint[];
}

/** Great-circle distance; matching SQL uses the same mean Earth radius. */
export function distanceBetween(a: Pick<RouteFix, "lat" | "lng">, b: Pick<RouteFix, "lat" | "lng">): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export type FixRejection = "coordinates" | "accuracy" | "timestamp" | "sequence" | "jump";

/** Client feedback only. The SQL ingestion function repeats all checks authoritatively. */
export function rejectFix(fix: RouteFix, previous: RouteFix | null, nowMs: number): FixRejection | null {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return "coordinates";
  if (!Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > ROUTE_LIMITS.maxAccuracyM) return "accuracy";
  const capturedMs = Date.parse(fix.capturedAt);
  if (!Number.isFinite(capturedMs) || capturedMs > nowMs || nowMs - capturedMs > ROUTE_LIMITS.maxAgeMs) return "timestamp";
  if (!Number.isSafeInteger(fix.sequence) || fix.sequence < 0 || (previous && fix.sequence <= previous.sequence)) return "sequence";
  if (previous) {
    const deltaMs = capturedMs - Date.parse(previous.capturedAt);
    if (deltaMs <= 0) return "timestamp";
    if (deltaMs <= ROUTE_LIMITS.maxGapMs && distanceBetween(previous, fix) / (deltaMs / 1000) > ROUTE_LIMITS.maxSpeedMps) return "jump";
  }
  return null;
}

/** Groups segments without drawing a line across missing coverage or manual pauses. */
export function routeSegments(points: RoutePoint[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let segmentId: number | null = null;
  for (const point of points) {
    if (point.segmentId !== segmentId) {
      segments.push([]);
      segmentId = point.segmentId;
    }
    segments[segments.length - 1].push([point.lng, point.lat]);
  }
  return segments;
}

export function routeGeoJson(points: RoutePoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: routeSegments(points).filter(segment => segment.length > 1).map(coordinates => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates },
    })),
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % (hours ? 60 : 100_000)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatPace(distanceM: number, elapsedMs: number): string {
  if (distanceM < 10 || elapsedMs <= 0) return "—";
  const secondsPerKm = elapsedMs / distanceM;
  return `${Math.floor(secondsPerKm / 60)}:${String(Math.floor(secondsPerKm % 60)).padStart(2, "0")}`;
}
