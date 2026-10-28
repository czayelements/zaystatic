import { isPanelOpen } from "@czayelements/zaystatic/next";
import { notFound } from "next/navigation";

import config from "../../zaystatic.config";
import { Panel } from "../../components/panel";

export const dynamic = "force-dynamic";

export default function PanelPage() {
  if (!isPanelOpen(config)) notFound();
  return <Panel />;
}
