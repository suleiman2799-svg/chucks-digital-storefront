"use client";

import { useEffect, useRef } from "react";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";
import { MultiCursorCoordinationEngine } from "../../lib/cursorbuild/multi-cursor-coordination-engine";

export default function CursorBuildPointers() {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current || !window.matchMedia("(pointer: fine)").matches) return;

    const manager = new CursorManager();
    manager.add({ id: "visitor", name: "You", color: "#C83A8F" });
    manager.add({ id: "chucks-guide", name: "Chucks guide", color: "#0BAE4E" });

    const coordination = new MultiCursorCoordinationEngine();
    const renderer = new CursorRenderer(manager, hostRef.current, {
      maxVisible: 2,
      tabletMaxVisible: 2,
      mobileMaxVisible: 0,
      touchMaxVisible: 0,
      duration: 0.32,
      ease: "power2.out",
      respectReducedMotion: true,
      clickFeedback: { style: "ripple-press", duration: 0.28, intensity: 0.55 }
    });

    let frame = 0;
    let latest = null;
    const onPointerMove = (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      latest = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!latest) return;
        const point = latest;
        renderer.moveTo("visitor", point, 0.12);
        renderer.moveTo("chucks-guide", {
          x: Math.max(8, point.x - 30),
          y: Math.max(8, point.y + 22)
        }, 0.48);
      });
    };
    let clickSequence = 0;
    const onPointerDown = (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
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

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      if (frame) window.cancelAnimationFrame(frame);
      coordination.destroy();
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer" aria-hidden="true" />;
}
