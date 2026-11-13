import { pageMetadata } from "@/i18n/page-metadata";
import { Dashboard } from "@/features/alerts/components/dashboard";

export const generateMetadata = () => pageMetadata("dashboard");

export default function Page() {
  return <Dashboard />;
}
