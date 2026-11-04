"use client";

import { useEffect, useRef } from "react";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";

const AGENTS = [
  ["architect", "Architect", "#C83A8F"],
  ["builder", "Builder", "#0BAE4E"],
  ["designer", "Designer", "#F28BC2"],
  ["stylist", "Stylist", "#B8D96B"],
  ["maker", "Maker", "#FF896D"],
  ["finisher", "Finisher", "#A99BFF"],
  ["curator", "Curator", "#62C7C0"],
  ["detailer", "Detailer", "#F4C66A"]
];

export default function CursorBuildPointers() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const manager = new CursorManager();
    AGENTS.forEach(([id, name, color]) => manager.add({ id, name, color }));
    const renderer = new CursorRenderer(manager, host, {
      maxVisible: 8,
      tabletMaxVisible: 8,
      mobileMaxVisible: 6,
      touchMaxVisible: 6,
      allowExternalResizeTargets: true,
      duration: 0.55,
      ease: "power3.inOut",
      respectReducedMotion: true,
      clickFeedback: { style: "ripple-press", duration: 0.34, intensity: 0.7 }
    });

    const queue = [];
    const busy = new Set();
    let nextAgent = 0;
    let alive = true;
    const timers = new Set();
    const later = (fn, ms) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (alive) fn();
      }, ms);
      timers.add(timer);
      return timer;
    };

    const pointFor = (rect, handle, bounds) => ({
      x: Math.max(10, Math.min(window.innerWidth - 30, rect.left + rect.width * handle.x - bounds.left)),
      y: Math.max(10, Math.min(window.innerHeight - 38, rect.top + rect.height * handle.y - bounds.top))
    });

    const pump = () => {
      if (!alive || !queue.length) return;
      while (queue.length && busy.size < 6) {
        let agent = null;
        for (let i = 0; i < AGENTS.length; i++) {
          const candidate = AGENTS[(nextAgent + i) % AGENTS.length][0];
          if (!busy.has(candidate)) {
            agent = candidate;
            nextAgent = (nextAgent + i + 1) % AGENTS.length;
            break;
          }
        }
        if (!agent) return;
        const target = queue.shift();
        if (!(target instanceof HTMLElement) || !target.isConnected) continue;
        busy.add(agent);
        construct(agent, target);
      }
    };

    const construct = (agent, target) => {
      const bounds = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        busy.delete(agent);
        later(pump, 60);
        return;
      }
      const originalWidth = Math.max(1, target.offsetWidth || rect.width);
      const originalHeight = Math.max(1, target.offsetHeight || rect.height);
      const originalInlineWidth = target.style.width;
      const originalInlineHeight = target.style.height;
      const startWidth = Math.max(48, originalWidth * 0.76);
      const startHeight = Math.max(36, originalHeight * 0.78);
      const handle = { x: 1, y: 1 };
      const startPoint = pointFor(rect, handle, bounds);

      renderer.moveNaturally(agent, {
        x: Math.max(12, startPoint.x - 54),
        y: Math.max(12, startPoint.y - 42)
      }, { duration: 0.52, curvature: 0.24, ease: "power2.inOut" });

      later(() => {
        if (!target.isConnected) {
          busy.delete(agent);
          pump();
          return;
        }
        try {
          // Collapse the real DOM box first, then have the cursor physically
          // pull its resize handle out to the element's finished dimensions.
          renderer.resize(agent, {
            target,
            to: { width: startWidth, height: startHeight },
            duration: 0,
            handle: "bottom-right"
          });
          const build = renderer.resize(agent, {
            target,
            to: { width: originalWidth, height: originalHeight },
            duration: 0.88,
            curvature: 0.28,
            handle: "bottom-right"
          });
          if (!build) {
            target.style.width = originalInlineWidth;
            target.style.height = originalInlineHeight;
            busy.delete(agent);
            pump();
            return;
          }
          build.eventCallback("onComplete", () => {
            if (!alive) return;
            renderer.click(agent, { style: "ripple-press", duration: 0.3, intensity: 0.65 });
            target.style.width = originalInlineWidth;
            target.style.height = originalInlineHeight;
            later(() => {
              busy.delete(agent);
              pump();
            }, 240);
          });
        } catch {
          target.style.width = originalInlineWidth;
          target.style.height = originalInlineHeight;
          busy.delete(agent);
          pump();
        }
      }, 180);
    };

    const onConstruct = (event) => {
      const target = event.detail?.target;
      if (!(target instanceof HTMLElement) || !target.isConnected) return;
      if (target.dataset.cursorbuildQueued === "true") return;
      target.dataset.cursorbuildQueued = "true";
      queue.push(target);
      pump();
    };

    window.addEventListener("cursorbuild:construct", onConstruct);
    return () => {
      alive = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      queue.length = 0;
      window.removeEventListener("cursorbuild:construct", onConstruct);
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer" aria-hidden="true" />;
}
