"use client";

import { useEffect } from "react";
import { ScrollConstructionEngine } from "../../lib/cursorbuild/scroll-construction-engine";

const REVEAL_SELECTORS = [
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
        const scene = engine.createScene(id, {
          trigger: element,
          start: "top 88%",
          end: "top 58%",
          reverse: true,
          respectReducedMotion: true
        }, (timeline) => {
          timeline.fromTo(element,
            { opacity: 0, y: 26 },
            { opacity: 1, y: 0, duration: 1, ease: "power2.out", immediateRender: false }
          );
        });
        scenes.push(scene);
      });
    });

    const refresh = window.requestAnimationFrame(() => engine.refresh());
    return () => {
      window.cancelAnimationFrame(refresh);
      scenes.forEach((scene) => scene.destroy());
      engine.destroy();
    };
  }, []);

  return null;
}
