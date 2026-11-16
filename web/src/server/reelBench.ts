/** Optional bench on the same laptop as the Next.js server. */
export async function notifyReelBench(committed: unknown) {
  if (process.env.SLOTTY_REEL_BENCH !== "1") return;
  try {
    const response = await fetch("http://127.0.0.1:8765/committed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(committed),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`bridge HTTP ${response.status}`);
    console.info("Slotty reel receipt", await response.json());
  } catch (error) {
    // The database transaction has already committed.
    console.warn("Roll saved; reel delivery unconfirmed", error);
  }
}
