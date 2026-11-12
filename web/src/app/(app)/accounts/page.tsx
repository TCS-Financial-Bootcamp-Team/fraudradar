import type { Metadata } from "next";
import { SuspiciousAccountsView } from "@/features/accounts/components/suspicious-accounts";

export const metadata: Metadata = { title: "Contas suspeitas · FraudRadar PLD" };

export default function Page() {
  return <SuspiciousAccountsView />;
}
