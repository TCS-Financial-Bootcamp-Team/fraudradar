import { Ingestion } from "@/features/ingestion/components/ingestion";
import { pageMetadata } from "@/i18n/page-metadata";

export const generateMetadata = () => pageMetadata("ingestion");

export default function Page() {
  return <Ingestion />;
}
