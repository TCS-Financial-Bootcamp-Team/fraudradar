import { pageMetadata } from "@/i18n/page-metadata";
import { SuspiciousAccountsView } from "@/features/accounts/components/suspicious-accounts";

export const generateMetadata = () => pageMetadata("accounts");

export default function Page() {
  return <SuspiciousAccountsView />;
}
