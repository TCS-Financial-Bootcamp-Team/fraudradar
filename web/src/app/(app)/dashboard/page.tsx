import type { Metadata } from "next";
import { Dashboard } from "@/features/alerts/components/dashboard";

export const metadata: Metadata = {
  title: "Visão geral · FraudRadar PLD",
};

export default function Page() {
  return <Dashboard />;
}
