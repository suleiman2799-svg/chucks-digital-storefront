"use client";

import { useEffect, useRef } from "react";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";
import { MultiCursorCoordinationEngine } from "../../lib/cursorbuild/multi-cursor-coordination-engine";

export default function CursorBuildPointers() {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const manager = new CursorManager();
    manager.add({ id: "visitor", name: "You", color: "#C83A8F" });
    manager.add({ id: "chucks-guide", name: "Chucks guide", color: "#0BAE4E" });

    const coordination = new MultiCursorCoordinationEngine();
    const renderer = new CursorRenderer(manager, hostRef.current, {
      maxVisible: 2,
      tabletMaxVisible: 2,
      mobileMaxVisible: 2,
      touchMaxVisible: 2,
      allowExternalResizeTargets: true,
      duration: 0.32,
      ease: "power2.out",
      respectReducedMotion: true,
      clickFeedback: { style: "ripple-press", duration: 0.28, intensity: 0.55 }
    });

    let frame = 0;
    let latest = null;
    const onPointerMove = (event) => {
      latest = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!latest) return;
        const point = latest;
        const bounds = hostRef.current.getBoundingClientRect();
        renderer.moveTo("visitor", { x: point.x - bounds.left, y: point.y - bounds.top }, 0.12);
        renderer.moveTo("chucks-guide", {
          x: Math.max(8, point.x - bounds.left - 30),
          y: Math.max(8, point.y - bounds.top + 22)
        }, 0.48);
      });
    };

    let clickSequence = 0;
    const onPointerDown = (event) => {
      const bounds = hostRef.current.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      renderer.moveTo("visitor", point, 0.08);
      renderer.moveTo("chucks-guide", { x: Math.max(8, point.x - 30), y: Math.max(8, point.y + 22) }, 0.18);
      const groupId = "pointer-click-" + (++clickSequence);
      const visitorTrack = coordination.createTimeline("visitor", [{
        id: groupId + "-visitor",
        run: ({ cursorId }) => renderer.click(cursorId)
      }], { mode: "parallel" });
      const guideTrack = coordination.createTimeline("chucks-guide", [{
        id: groupId + "-guide",
        run: ({ cursorId }) => renderer.click(cursorId)
      }], { mode: "parallel" });
      const group = coordination.createGroup(groupId, [visitorTrack, guideTrack]);
      void group.run().catch(() => {}).finally(() => coordination.destroyGroup(groupId));
    };

    // Serialize construction passes so fast scrolling cannot start two resize
    // operations on the same cursor/element at once.
    const constructionQueue = [];
    const constructionTimers = new Set();
    let constructionBusy = false;
    let alive = true;
    const later = (fn, delay) => {
      const timer = window.setTimeout(() => {
        constructionTimers.delete(timer);
        if (alive) fn();
      }, delay);
      constructionTimers.add(timer);
      return timer;
    };
    const processConstruction = () => {
      if (!alive || constructionBusy || !constructionQueue.length) return;
      const target = constructionQueue.shift();
      if (!(target instanceof HTMLElement) || !target.isConnected) {
        processConstruction();
        return;
      }
      constructionBusy = true;
      const bounds = hostRef.current?.getBoundingClientRect();
      if (!bounds) { constructionBusy = false; return; }
      const rect = target.getBoundingClientRect();
      const center = {
        x: Math.max(12, Math.min(window.innerWidth - 32, rect.left + rect.width / 2 - bounds.left)),
        y: Math.max(12, Math.min(window.innerHeight - 42, rect.top + rect.height / 2 - bounds.top))
      };
      renderer.moveNaturally("visitor", center, { duration: 0.42, curvature: 0.16, ease: "power2.inOut" });
      renderer.moveNaturally("chucks-guide", {
        x: Math.max(12, center.x - 34), y: Math.max(12, center.y + 24)
      }, { duration: 0.58, curvature: 0.18, ease: "power2.inOut" });

      // Use untransformed border-box dimensions so the restore pass is exact.
      const width = Math.max(1, target.offsetWidth || rect.width);
      const height = Math.max(1, target.offsetHeight || rect.height);
      const targetWidth = Math.max(48, Math.min(width * 1.035, width + 28));
      const targetHeight = Math.max(36, Math.min(height * 1.025, height + 20));
      const finish = () => {
        constructionBusy = false;
        later(processConstruction, 100);
      };
      later(() => {
        if (!target.isConnected) { finish(); return; }
        try {
          const build = renderer.resize("visitor", {
            target,
            to: { width: targetWidth, height: targetHeight },
            duration: 0.72,
            curvature: 0.2,
            handle: "bottom-right"
          });
          if (!build) {
            renderer.resize("visitor", { target, to: { width, height }, duration: 0 });
            finish();
            return;
          }
          build.eventCallback("onComplete", () => {
            if (!alive) return;
            renderer.click("chucks-guide", { style: "ripple-press", duration: 0.24, intensity: 0.45 });
            later(() => {
              if (!target.isConnected) { finish(); return; }
              try {
                const restore = renderer.resize("visitor", {
                  target,
                  to: { width, height },
                  duration: 0.52,
                  curvature: 0.16,
                  handle: "bottom-right"
                });
                if (restore) restore.eventCallback("onComplete", () => {
                  renderer.click("visitor", { duration: 0.2 });
                  finish();
                });
                else finish();
              } catch {
                finish();
              }
            }, 180);
          });
        } catch {
          finish();
        }
      }, 460);
    };
    const onConstruct = (event) => {
      const target = event.detail?.target;
      if (!(target instanceof HTMLElement) || !target.isConnected) return;
      constructionQueue.push(target);
      processConstruction();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("cursorbuild:construct", onConstruct);

    return () => {
      alive = false;
      constructionTimers.forEach((timer) => window.clearTimeout(timer));
      constructionTimers.clear();
      constructionQueue.length = 0;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("cursorbuild:construct", onConstruct);
      if (frame) window.cancelAnimationFrame(frame);
      coordination.destroy();
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer" aria-hidden="true" />;
}
