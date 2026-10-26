import { redirect } from "next/navigation";

import { navigation } from "@/lib/content";

export default function DocsIndex() {
  redirect(`/docs/${navigation()[0]?.pages[0]?.slug ?? "introduction"}`);
}
