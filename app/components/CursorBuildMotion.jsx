"use client";

import { useEffect } from "react";
import { CinematicAnimationEngine } from "../../lib/cursorbuild/cinematic-animation-engine";

export default function CursorBuildMotion() {
  useEffect(() => {
    const engine = new CinematicAnimationEngine({
      respectReducedMotion: true,
      defaults: { duration: 0.85, ease: "power3.out" }
    });
    const cleanups = [];

    const animate = (selector, options = {}) => {
      const elements = document.querySelectorAll(selector);
      if (!elements.length) return;
      cleanups.push(engine.stagger(elements, {
        from: { opacity: 0, y: 28 },
        to: { opacity: 1, y: 0 },
        duration: options.duration ?? 0.8,
        stagger: options.stagger ?? 0.12
      }));
    };

    // Keep content visible if the browser has reduced motion enabled.
    animate(".arrival-intro .intro-content", { duration: 0.9 });
    animate(".arrival-wings .wings-heading", { duration: 0.85 });
    animate(".arrival-wings .wing-card", { duration: 0.75, stagger: 0.14 });
    animate(".arrival-invitation .invitation-copy", { duration: 0.9 });
    animate(".arrival-footer .arrival-brand, .arrival-footer .arrival-footer-links", { duration: 0.7, stagger: 0.1 });

    return () => {
      cleanups.forEach(timeline => timeline && engine.killAll());
      engine.destroy();
    };
  }, []);

  return null;
}
