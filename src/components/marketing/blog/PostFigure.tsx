import type { BlogFigure } from "@/content/blog";
import { DIAGRAM_REGISTRY } from "./diagramRegistry";

export default function PostFigure({ figure }: { figure: BlogFigure }) {
  if (figure.kind === "photo") {
    // Not built yet — the content model supports it so adding one later
    // is a content edit here, not a template change.
    return null;
  }

  const Diagram = DIAGRAM_REGISTRY[figure.diagramId];
  if (!Diagram) {
    const message = `No diagram registered for diagramId "${figure.diagramId}"`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(message);
    }
    console.error(message);
    return null;
  }

  return (
    <figure className="mt-8">
      <div className="rounded-[14px] border border-border bg-surface p-5 sm:p-6">
        <Diagram alt={figure.alt} />
      </div>
      <figcaption className="mt-3 text-sm text-text-muted">
        {figure.caption}
      </figcaption>
    </figure>
  );
}
