import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <h1>Profile</h1>
      <p>Your account details, display name, and timezone settings will appear here.</p>
      <p className="placeholder-note">Coming soon.</p>
    </>
  );
}
