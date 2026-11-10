import type { Metadata } from "next";
import { RewardPreview } from "@/features/redeem/RewardPreview";
export const metadata: Metadata = { title: "Rewards" };
export default function RedeemPage() { return <RewardPreview />; }
