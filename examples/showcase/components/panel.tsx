"use client";

import { ZayApp, createBlockBuilder } from "@czayelements/zaystatic/ui";

import { FeaturesPreview, HeroPreview, PageFrame } from "./previews";

const PageBuilder = createBlockBuilder({
  field: "sections",
  previews: { hero: HeroPreview, features: FeaturesPreview },
  Frame: PageFrame,
});

export function Panel() {
  return <ZayApp apiPath="/api/zaystatic" editors={{ page: PageBuilder }} theme="zay-ui" />;
}
