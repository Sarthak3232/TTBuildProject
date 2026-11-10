import { describe, expect, it } from "vitest";
import { distanceBetween, formatDuration, formatPace, rejectFix, routeGeoJson, routeSegments, type RouteFix, type RoutePoint } from "../../src/domain/time/route";
const now = Date.parse("2026-11-10T01:00:00Z");
const fix = (values: Partial<RouteFix> = {}): RouteFix => ({ sequence: 1, capturedAt: new Date(now - 1000).toISOString(), lat: 0, lng: 0, accuracyM: 5, ...values });

describe("real route geometry", () => {
 it("uses great-circle metres across the date line", () => {
  expect(distanceBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 0.0001 })).toBeCloseTo(11.119508, 4);
  expect(distanceBetween({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 })).toBeCloseTo(22.239016, 4);
 });
 it("never connects separate coverage segments on the map", () => {
  const points: RoutePoint[] = [
   { ...fix({ sequence: 0, lng: 1 }), segmentId: 0 },
   { ...fix({ sequence: 1, lng: 2 }), segmentId: 0 },
   { ...fix({ sequence: 5, lng: 10 }), segmentId: 1 },
   { ...fix({ sequence: 6, lng: 11 }), segmentId: 1 },
   { ...fix({ sequence: 9, lng: 20 }), segmentId: 2 },
  ];
  expect(routeSegments(points)).toEqual([[[1, 0], [2, 0]], [[10, 0], [11, 0]], [[20, 0]]]);
  expect(routeGeoJson(points).features.map(f => f.geometry.coordinates)).toEqual([[[1, 0], [2, 0]], [[10, 0], [11, 0]]]);
 });
 it("reports no pace from missing or tiny distance", () => {
  expect(formatPace(0, 60_000)).toBe("—");
  expect(formatPace(9, 60_000)).toBe("—");
  expect(formatPace(1000, 360_000)).toBe("6:00");
  expect(formatDuration(3_661_999)).toBe("1:01:01");
 });
});
describe("foreground GPS quality feedback", () => {
 it.each([
  [{ lat: 91 }, "coordinates"],
  [{ lng: Infinity }, "coordinates"],
  [{ accuracyM: 50.01 }, "accuracy"],
  [{ accuracyM: -1 }, "accuracy"],
  [{ capturedAt: new Date(now - 15_001).toISOString() }, "timestamp"],
  [{ capturedAt: new Date(now + 1).toISOString() }, "timestamp"],
  [{ capturedAt: "invalid" }, "timestamp"],
  [{ sequence: 1.5 }, "sequence"],
 ] as const)("rejects %j", (change, reason) => expect(rejectFix(fix(change), null, now)).toBe(reason));
 it("accepts accuracy and age at their documented boundaries", () => expect(rejectFix(fix({ accuracyM: 50, capturedAt: new Date(now - 15_000).toISOString() }), null, now)).toBeNull());
 it("rejects out-of-order coordinates and impossible running jumps", () => {
  const previous = fix({ sequence: 0, capturedAt: new Date(now - 2000).toISOString() });
  expect(rejectFix(fix({ sequence: 0 }), previous, now)).toBe("sequence");
  expect(rejectFix(fix({ capturedAt: previous.capturedAt }), previous, now)).toBe("timestamp");
  expect(rejectFix(fix({ lng: 1 }), previous, now)).toBe("jump");
  expect(rejectFix(fix({ lng: 0.00001 }), previous, now)).toBeNull();
 });
 it("does not bridge a long GPS outage with a speed guess", () => {
  const previous = fix({ sequence: 0, capturedAt: new Date(now - 30_000).toISOString() });
  expect(rejectFix(fix({ lng: 1 }), previous, now)).toBeNull();
 });
});
