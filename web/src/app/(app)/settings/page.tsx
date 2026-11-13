import { Settings } from "@/features/settings/components/settings";
import { pageMetadata } from "@/i18n/page-metadata";

export const generateMetadata = () => pageMetadata("settings");

export default function Page() {
  return <Settings />;
}
