"use client";

import { useEffect } from "react";
import { CinematicAnimationEngine } from "../../lib/cursorbuild/cinematic-animation-engine";

export default function CursorBuildMotion() {
  useEffect(() => {
    const engine = new CinematicAnimationEngine({
      respectReducedMotion: true,
      defaults: { duration: 0.85, ease: "power3.out" }
    });
    const animate = (selector, options = {}) => {
      const elements = document.querySelectorAll(selector);
      if (!elements.length) return;
      engine.stagger(Array.from(elements), {
        from: { opacity: 0, y: 28 },
        to: { opacity: 1, y: 0 },
        duration: options.duration ?? 0.8,
        stagger: options.stagger ?? 0.12
      });
    };

    // Keep above-the-fold shop content cinematic; below-the-fold sections are
    // deliberately controlled by CursorBuildScroll so the cursors construct them.
    animate(".hero-copy", { duration: 0.9 });
    animate(".lobby", { duration: 0.7 });
    animate(".spot-copy", { duration: 0.85 });

    return () => engine.destroy();
  }, []);

  return null;
}
