"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker, GeoJSONSource } from "maplibre-gl";
import { routeGeoJson, type RoutePoint } from "@/domain/time/route";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./tracking.module.css";

export function RouteMap({ points }: { points: RoutePoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const latestPoints = useRef(points);
  const centered = useRef(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { latestPoints.current = points; }, [points]);

  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl").then(lib => {
      if (disposed || !container.current) return;
      try {
        const instance = new lib.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [0, 20],
          zoom: 1,
          attributionControl: { compact: false },
        });
        map.current = instance;
        instance.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        instance.on("error", () => {
          if (!disposed) setError("Map tiles are unavailable. Your timer and saved GPS route still work.");
        });
        instance.on("load", () => {
          if (disposed) return;
          instance.addSource("activity-route", { type: "geojson", data: routeGeoJson(latestPoints.current) });
          instance.addLayer({ id: "activity-route", type: "line", source: "activity-route", paint: { "line-color": "#f93c72", "line-width": 5 }, layout: { "line-join": "round", "line-cap": "round" } });
          marker.current = new lib.Marker({ color: "#3f9be8" });
          setLoaded(true);
        });
      } catch {
        if (!disposed) setError("This browser cannot display the map. Your timer and saved GPS route still work.");
      }
    }).catch(() => {
      if (!disposed) setError("The map could not load. Your timer and GPS collection are independent of the map.");
    });
    return () => {
      disposed = true;
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
      centered.current = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!loaded || !map.current) return;
    const source = map.current.getSource("activity-route") as GeoJSONSource | undefined;
    source?.setData(routeGeoJson(points));
    const last = points.at(-1);
    if (!last) return;
    marker.current?.setLngLat([last.lng, last.lat]).addTo(map.current);
    if (!centered.current) {
      centered.current = true;
      if (points.length > 1) {
        const lngs = points.map(point => point.lng);
        const lats = points.map(point => point.lat);
        map.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, maxZoom: 16, duration: 0 });
      } else map.current.jumpTo({ center: [last.lng, last.lat], zoom: 16 });
    }
  }, [points, loaded]);

  return <div className={styles.mapFrame}>
    <div className={styles.liveMap} ref={container} role="img" aria-label={points.length ? "Map of your recorded activity route. Breaks represent missing GPS coverage or pauses." : "Map waiting for your first valid GPS position."} />
    {points.length > 0 && <button className={styles.center} type="button" aria-label="Center map on last recorded position" onClick={() => {
      const last = points.at(-1);
      if (last) map.current?.easeTo({ center: [last.lng, last.lat], zoom: 16 });
    }}>⌖</button>}
    {!points.length && <p className={styles.mapEmpty}>Your route appears after a valid GPS fix.</p>}
    {error && <div className={styles.mapError} role="status">{error} <button type="button" onClick={() => { setError(""); setLoaded(false); setAttempt(value => value + 1); }}>Retry map</button></div>}
    <div className={styles.mapAttribution}><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></div>
  </div>;
}
