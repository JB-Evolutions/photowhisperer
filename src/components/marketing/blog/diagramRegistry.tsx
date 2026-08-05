import type { ComponentType } from "react";
import EvScaleDiagram from "@/components/marketing/blog-diagrams/EvScaleDiagram";
import ShutterLadderDiagram from "@/components/marketing/blog-diagrams/ShutterLadderDiagram";
import IsoTimelineDiagram from "@/components/marketing/blog-diagrams/IsoTimelineDiagram";

export const DIAGRAM_REGISTRY: Record<string, ComponentType<{ alt: string }>> = {
  "night-street-ev-scale": EvScaleDiagram,
  "indoor-sports-shutter-ladder": ShutterLadderDiagram,
  "wedding-iso-timeline": IsoTimelineDiagram,
};
