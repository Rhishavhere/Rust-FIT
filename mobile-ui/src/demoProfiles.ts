import type { LayersMap } from "./types";

export type DemoProfile = {
  id: string;
  label: string;
  tagline: string;
  defaultDisplayName: string;
  defaultFitScore: number;
  defaultLayers: LayersMap;
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: "arjun-entrepreneur",
    label: "Arjun Malhotra",
    tagline: "Founder profile · growth-stage fintech",
    defaultDisplayName: "Arjun Malhotra",
    defaultFitScore: 781,
    defaultLayers: {
      layer1: { display_name: "Arjun Malhotra" },
      layer2: { cibil_score: 781 },
      layer3: { net_worth: 23500000 },
      layer6: {
        attestations: [
          { type: "KYC", status: "verified" },
          { type: "GST", status: "verified" },
        ],
      },
    },
  },
  {
    id: "ananya-product",
    label: "Ananya Rao",
    tagline: "Product leader · enterprise SaaS",
    defaultDisplayName: "Ananya Rao",
    defaultFitScore: 734,
    defaultLayers: {
      layer1: { display_name: "Ananya Rao" },
      layer2: { cibil_score: 734 },
      layer3: { net_worth: 11800000 },
      layer6: {
        attestations: [
          { type: "KYC", status: "verified" },
          { type: "Employment", status: "verified" },
        ],
      },
    },
  },
];

export function getDemoProfile(profileId: string): DemoProfile | undefined {
  return DEMO_PROFILES.find((profile) => profile.id === profileId);
}

export function cloneLayers(layers: LayersMap): LayersMap {
  return JSON.parse(JSON.stringify(layers)) as LayersMap;
}

