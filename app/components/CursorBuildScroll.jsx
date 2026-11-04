"use client";

import { useEffect } from "react";
import { ScrollConstructionEngine } from "../../lib/cursorbuild/scroll-construction-engine";

const REVEAL_SELECTORS = [
  // Landing hero: reveal the actual headline, copy and architectural details.
  ".arrival-copy .arrival-logo-reveal",
  ".arrival-copy .arrival-kicker",
  ".arrival-copy h1",
  ".arrival-copy > p",
  ".arrival-copy .arrival-actions",
  ".arrival-hero .architecture",
  ".arrival-hero .marker-a",
  ".arrival-hero .marker-b",
  ".hero-bottomline",
  ".vertical-note",
  // The next chapters are constructed as the visitor scrolls.
  ".arrival-intro .intro-content",
  ".arrival-intro .intro-stamp",
  ".arrival-wings .wings-heading",
  ".arrival-wings .wing-card",
  ".arrival-invitation .invitation-copy",
  ".arrival-invitation .invitation-door",
  ".arrival-invitation .invitation-foot",
  ".arrival-footer .arrival-brand",
  ".arrival-footer .arrival-footer-links",
  ".arrival-footer > p",
  ".arrival-footer .arrival-legal",
  ".arrival-footer .arrival-credit",
  // Shop page targets remain supported.
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
        // Establish the hidden state before ScrollTrigger measures the page.
        element.classList.add("cursorbuild-unbuilt");
        const id = "cursorbuild-scene-" + (++sequence);
        let dispatched = false;
        const scene = engine.createScene(id, {
          trigger: element,
          start: "top 88%",
          end: "top 48%",
          reverse: false,
          respectReducedMotion: true,
          onProgress: (progress) => {
            if (progress > 0.015 && !dispatched) {
              dispatched = true;
              window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
                detail: { id, target: element }
              }));
            }
          }
        }, (timeline) => {
          timeline.fromTo(element,
            {
              autoAlpha: 0,
              y: 30,
              scale: 0.965,
              clipPath: "inset(0 100% 0 0 round 10px)"
            },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              clipPath: "inset(0 0% 0 0 round 0px)",
              duration: 1,
              ease: "power3.out",
              immediateRender: true
            }
          );
        });
        scenes.push(scene);
      });
    });

    const refresh = window.requestAnimationFrame(() => engine.refresh());
    const refreshAfterLayout = window.setTimeout(() => engine.refresh(), 500);
    const refreshAfterFonts = document.fonts?.ready?.then(() => {
      if (document.visibilityState !== "hidden") engine.refresh();
    });

    return () => {
      window.cancelAnimationFrame(refresh);
      window.clearTimeout(refreshAfterLayout);
      scenes.forEach((scene) => scene.destroy());
      engine.destroy();
      void refreshAfterFonts;
    };
  }, []);

  return null;
}
