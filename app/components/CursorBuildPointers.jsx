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

    // Scroll scenes request a coordinated cursor pass over each element as it enters view.
    const onConstruct = (event) => {
      const target = event.detail?.target;
      if (!(target instanceof HTMLElement) || !target.isConnected) return;
      const host = hostRef.current;
      if (!host) return;
      const hostRect = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const centerX = rect.left - hostRect.left + rect.width / 2;
      const centerY = rect.top - hostRect.top + Math.min(rect.height / 2, 90);
      const visitorPoint = {
        x: Math.max(8, Math.min(host.clientWidth - 28, centerX - 8)),
        y: Math.max(8, Math.min(host.clientHeight - 38, centerY - 8))
      };
      const guidePoint = {
        x: Math.max(8, Math.min(host.clientWidth - 28, centerX + 22)),
        y: Math.max(8, Math.min(host.clientHeight - 38, centerY + 18))
      };

      const visitorMove = renderer.moveNaturally("visitor", visitorPoint, {
        duration: 0.72, curvature: 0.22, ease: "power2.inOut"
      });
      const guideMove = renderer.moveNaturally("chucks-guide", guidePoint, {
        duration: 0.92, curvature: 0.18, ease: "power2.inOut"
      });
      if (visitorMove) visitorMove.eventCallback("onComplete", () => renderer.click("visitor"));
      if (guideMove) guideMove.eventCallback("onComplete", () => renderer.click("chucks-guide"));
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("cursorbuild:construct", onConstruct);

    return () => {
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
