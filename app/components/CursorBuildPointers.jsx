"use client";

import { useEffect, useRef } from "react";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";

const AGENTS = [
  ["architect", "", "#000000"],
  ["builder", "", "#000000"],
  ["designer", "", "#000000"],
  ["stylist", "", "#000000"],
  ["maker", "", "#000000"],
  ["finisher", "", "#000000"],
  ["curator", "", "#000000"],
  ["detailer", "", "#000000"],
  ["sculptor", "", "#000000"],
  ["navigator", "", "#000000"],
  ["composer", "", "#000000"],
  ["polisher", "", "#000000"]
];

export default function CursorBuildPointers() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const manager = new CursorManager();
    AGENTS.forEach(([id, name, color]) => manager.add({ id, name, color }));
    const renderer = new CursorRenderer(manager, host, {
      maxVisible: 12,
      tabletMaxVisible: 12,
      mobileMaxVisible: 12,
      touchMaxVisible: 12,
      allowExternalResizeTargets: true,
      duration: 0.55,
      ease: "power3.inOut",
      respectReducedMotion: true,
      clickFeedback: { style: "ripple-press", duration: 0.34, intensity: 0.7 }
    });

    host.querySelectorAll(".cursorbuild-cursor").forEach((node) => {
      node.style.opacity = "0";
      node.style.visibility = "hidden";
      node.style.transition = "opacity 160ms ease";
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
      const cursorNode = host.querySelector(`.cursorbuild-cursor[data-cursor-id="${agent}"]`);
      const hideCursor = () => {
        if (cursorNode) {
          cursorNode.style.opacity = "0";
          cursorNode.style.visibility = "hidden";
        }
      };
      const showCursor = () => {
        if (cursorNode) {
          cursorNode.style.visibility = "visible";
          cursorNode.style.opacity = "1";
        }
      };
      const finish = () => {
        host.querySelectorAll(".cursorbuild-resize-frame").forEach((frame) => frame.remove());
        target.style.width = originalInlineWidth;
        target.style.height = originalInlineHeight;
        later(() => {
          host.querySelectorAll(".cursorbuild-resize-frame").forEach((frame) => frame.remove());
          hideCursor();
          busy.delete(agent);
          pump();
        }, 220);
      };

      // Place the hidden cursor beside its target before revealing it. This
      // prevents the renderer's default top-left spawn positions from flashing.
      renderer.moveTo(agent, {
        x: Math.max(10, startPoint.x - 54),
        y: Math.max(10, startPoint.y - 42)
      }, 0);
      showCursor();

      const approach = renderer.moveNaturally(agent, {
        x: Math.max(10, startPoint.x - 54),
        y: Math.max(10, startPoint.y - 42)
      }, { duration: 0.01, curvature: 0.12, ease: "power2.inOut" });

      const beginResize = () => {
        if (!alive || !target.isConnected) {
          hideCursor();
          busy.delete(agent);
          pump();
          return;
        }
        try {
          // Shrink the real DOM box, then let the cursor travel to the
          // bottom-right handle and expand it back to its intended dimensions.
          target.style.width = startWidth + "px";
          target.style.height = startHeight + "px";
          const build = renderer.resize(agent, {
            target,
            to: { width: originalWidth, height: originalHeight },
            duration: 0.92,
            curvature: 0.28,
            handle: "bottom-right"
          });
          if (!build) {
            target.style.width = originalInlineWidth;
            target.style.height = originalInlineHeight;
            finish();
            return;
          }
          build.eventCallback("onComplete", () => {
            if (!alive) return;
            renderer.click(agent, { style: "ripple-press", duration: 0.3, intensity: 0.65 });
            finish();
          });
        } catch {
          target.style.width = originalInlineWidth;
          target.style.height = originalInlineHeight;
          finish();
        }
      };

      if (approach) approach.eventCallback("onComplete", beginResize);
      else beginResize();
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
      host.querySelectorAll(".cursorbuild-resize-frame").forEach((frame) => frame.remove());
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer cursorbuild-landing-only" aria-hidden="true" />;
}
