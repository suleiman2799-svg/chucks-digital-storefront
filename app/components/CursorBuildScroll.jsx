"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollConstructionEngine } from "../../lib/cursorbuild/scroll-construction-engine";

const REVEAL_SELECTORS = [
  // Start at the very top: brand identity and navigation are the first build.
  ".arrival-nav .arrival-brand",
  ".arrival-nav .arrival-nav-links",
  ".arrival-nav .arrival-nav-cta",
  ".arrival-coordinate",
  ".arrival-orbit",
  // The hero logo is deliberately first among the hero content.
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
];

export default function CursorBuildScroll() {
  useEffect(() => {
    const engine = new ScrollConstructionEngine();
    const scenes = [];
    const dispatched = new WeakSet();
    const timers = new Set();
    let sequence = 0;
    let alive = true;

    const dispatchConstruction = (element) => {
      if (!alive || !(element instanceof HTMLElement) || !element.isConnected || dispatched.has(element)) return;
      dispatched.add(element);
      const id = "cursorbuild-scene-" + (++sequence);
      window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
        detail: { id, target: element }
      }));
    };

    // Build everything already visible on first paint instead of waiting for
    // ScrollTrigger to receive a scroll event. This makes the opening logo,
    // navigation and hero composition come alive immediately at scrollY = 0.
    let initialOrder = 0;
    REVEAL_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.add("cursorbuild-unbuilt");
        const rect = element.getBoundingClientRect();
        const inOpeningViewport = rect.bottom > 0 && rect.top < window.innerHeight * 1.18;
        if (inOpeningViewport) {
          // Opening-viewport elements must not be held at the hidden start
          // state of a paused ScrollTrigger timeline. Make them visible first,
          // then let the cursor perform the actual resize/build animation.
          gsap.set(element, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            clipPath: "inset(0 0% 0 0 round 0px)"
          });
          element.classList.remove("cursorbuild-unbuilt");
          const delay = initialOrder * 145;
          const timer = window.setTimeout(() => {
            timers.delete(timer);
            dispatchConstruction(element);
          }, delay);
          timers.add(timer);
          initialOrder += 1;
          return;
        }

        const id = "cursorbuild-scene-" + (++sequence);
        const scene = engine.createScene(id, {
          trigger: element,
          start: "top 88%",
          end: "top 48%",
          reverse: false,
          respectReducedMotion: true,
          onProgress: (progress) => {
            if (progress > 0.015) dispatchConstruction(element);
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
      if (alive && document.visibilityState !== "hidden") engine.refresh();
    });

    return () => {
      alive = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      window.cancelAnimationFrame(refresh);
      window.clearTimeout(refreshAfterLayout);
      scenes.forEach((scene) => scene.destroy());
      engine.destroy();
      void refreshAfterFonts;
    };
  }, []);

  return null;
}
