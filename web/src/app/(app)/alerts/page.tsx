import { AlertQueue } from "@/features/alerts/components/alert-queue";
import { pageMetadata } from "@/i18n/page-metadata";

export const generateMetadata = () => pageMetadata("alerts");

export default function Page() {
  return <AlertQueue />;
}
