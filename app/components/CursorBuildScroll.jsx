"use client";

import { useEffect } from "react";
import { ScrollConstructionEngine } from "../../lib/cursorbuild/scroll-construction-engine";

const REVEAL_SELECTORS = [
  // Cinematic landing page — include the hero build as well as every later section.
  ".arrival-hero .arrival-copy",
  ".arrival-hero .architecture",
  ".arrival-hero .marker-a",
  ".arrival-hero .marker-b",
  ".arrival-intro .intro-content",
  ".arrival-intro .intro-stamp",
  ".arrival-wings .wings-heading",
  ".arrival-wings .wing-card",
  ".arrival-invitation .invitation-copy",
  ".arrival-invitation .invitation-door",
  ".arrival-footer .arrival-brand",
  ".arrival-footer .arrival-footer-links",
  ".arrival-footer .arrival-legal",
  ".arrival-footer .arrival-credit",
  // Shopping page.
  ".section-head",
  ".doors .door",
  ".products .product",
  ".collection-grid .collection",
  ".service-list .service",
  ".visit-copy"
];

export default function CursorBuildScroll() {
  useEffect(() => {
    const engine = new ScrollConstructionEngine();
    const scenes = [];
    let sequence = 0;

    REVEAL_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        const id = "scroll-reveal-" + (++sequence);
        let inside = false;
        const scene = engine.createScene(id, {
          trigger: element,
          start: "top 88%",
          end: "top 58%",
          reverse: true,
          respectReducedMotion: true,
          onProgress: (progress) => {
            const entered = progress > 0.02;
            if (entered && !inside) {
              inside = true;
              window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
                detail: { id, target: element }
              }));
            } else if (!entered) {
              inside = false;
            }
          }
        }, (timeline) => {
          timeline.fromTo(element,
            { opacity: 0, y: 34, scale: 0.985 },
            { opacity: 1, y: 0, scale: 1, duration: 1, ease: "power2.out", immediateRender: false }
          );
        });
        scenes.push(scene);
      });
    });

    const refresh = window.requestAnimationFrame(() => engine.refresh());
    const refreshAfterLayout = window.setTimeout(() => engine.refresh(), 350);
    return () => {
      window.cancelAnimationFrame(refresh);
      window.clearTimeout(refreshAfterLayout);
      scenes.forEach((scene) => scene.destroy());
      engine.destroy();
    };
  }, []);

  return null;
}
