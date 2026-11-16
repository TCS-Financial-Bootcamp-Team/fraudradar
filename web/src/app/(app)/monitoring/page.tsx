import { MonitoringView } from "@/features/alerts/components/monitoring";
import { pageMetadata } from "@/i18n/page-metadata";

export const generateMetadata = () => pageMetadata("monitoring");

export default function Page() {
  return <MonitoringView />;
}
