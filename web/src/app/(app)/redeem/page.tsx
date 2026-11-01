import type { Metadata } from "next";

export const metadata: Metadata = { title: "Redeem" };

export default function RedeemPage() {
  return (
    <>
      <h1>Redeem</h1>
      <p>Your four drawers, token allocations, and roll results will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
