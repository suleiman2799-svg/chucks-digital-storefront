"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";

const CURSOR_ID = "designer";
const EASE = "power3.out";
const TIMING = {
  glide: 0.3,
  draw: 0.6,
  wireframeHold: 0.4,
  revealPause: 0.15,
  contentReveal: 0.4,
  guideFade: 0.3
};

const waitForTimeline = (timeline) => new Promise((resolve) => {
  if (!timeline) return resolve();
  const previous = timeline.eventCallback("onComplete");
  timeline.eventCallback("onComplete", (...args) => {
    if (typeof previous === "function") previous.apply(timeline, args);
    resolve();
  });
});

export default function CursorBuildPointers() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const manager = new CursorManager();
    manager.add({ id: CURSOR_ID, name: "designer", color: "#ffffff" });

    const renderer = new CursorRenderer(manager, host, {
      maxVisible: 1,
      tabletMaxVisible: 1,
      mobileMaxVisible: 1,
      touchMaxVisible: 1,
      duration: TIMING.glide,
      ease: EASE,
      naturalMovement: { duration: TIMING.glide, ease: EASE, curvature: 0.12 },
      initialPositions: { [CURSOR_ID]: { x: 24, y: 24 } },
      respectReducedMotion: false,
      clickFeedback: { style: "ripple-press", duration: 0.28, intensity: 0.5 }
    });

    const cursorNode = host.querySelector(`.cursorbuild-cursor[data-cursor-id="${CURSOR_ID}"]`);
    const trail = document.createElement("span");
    trail.className = "cursorbuild-motion-trail";
    host.appendChild(trail);

    const guides = new Set();
    const queue = [];
    const queued = new WeakSet();
    let active = false;
    let alive = true;
    let trailFrame = 0;

    const updateTrail = () => {
      if (!alive) return;
      if (cursorNode) {
        const x = Number(gsap.getProperty(cursorNode, "x")) || 0;
        const y = Number(gsap.getProperty(cursorNode, "y")) || 0;
        trail.style.transform = `translate3d(${x + 7}px,${y + 13}px,0)`;
        trail.style.opacity = active ? "0.34" : "0.16";
      }
      trailFrame = window.requestAnimationFrame(updateTrail);
    };
    trailFrame = window.requestAnimationFrame(updateTrail);

    const notifyComplete = (target) => {
      window.dispatchEvent(new CustomEvent("cursorbuild:complete", { detail: { target } }));
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const cursorPoint = (x, y) => ({
      x: clamp(x, 8, Math.max(8, window.innerWidth - 32)),
      y: clamp(y, 8, Math.max(8, window.innerHeight - 38))
    });

    const makeGuide = (rect) => {
      const width = Math.max(12, rect.width);
      const height = Math.max(12, rect.height);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.classList.add("cursorbuild-wireframe");
      svg.style.left = `${rect.left}px`;
      svg.style.top = `${rect.top}px`;
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;

      const perimeter = Math.max(1, 2 * (width + height));
      const outline = document.createElementNS(svg.namespaceURI, "rect");
      outline.setAttribute("x", "1");
      outline.setAttribute("y", "1");
      outline.setAttribute("width", String(Math.max(1, width - 2)));
      outline.setAttribute("height", String(Math.max(1, height - 2)));
      outline.setAttribute("rx", "2");
      outline.setAttribute("fill", "none");
      outline.setAttribute("stroke", "#c83a8f");
      outline.setAttribute("stroke-width", "1.5");
      outline.setAttribute("stroke-dasharray", String(perimeter));
      outline.setAttribute("stroke-dashoffset", String(perimeter));
      outline.classList.add("cursorbuild-wireframe-outline");
      svg.appendChild(outline);

      const mobile = window.matchMedia("(max-width: 650px)").matches;
      const lineSpecs = mobile
        ? [[width * 0.5, 0, width * 0.5, height], [0, height * 0.5, width, height * 0.5]]
        : [[width * 0.33, 0, width * 0.33, height], [width * 0.66, 0, width * 0.66, height],
           [0, height * 0.5, width, height * 0.5]];
      lineSpecs.forEach(([x1, y1, x2, y2]) => {
        const line = document.createElementNS(svg.namespaceURI, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", "#c83a8f");
        line.setAttribute("stroke-width", "0.8");
        line.setAttribute("stroke-opacity", mobile ? "0.25" : "0.32");
        line.setAttribute("stroke-dasharray", "3 5");
        line.classList.add("cursorbuild-wireframe-detail");
        svg.appendChild(line);
      });

      host.appendChild(svg);
      guides.add(svg);
      return { svg, outline, width, height, perimeter };
    };

    const buildOne = async (element) => {
      if (!alive || !element?.isConnected) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        element.classList.remove("cursorbuild-unbuilt");
        gsap.set(element, { autoAlpha: 1, y: 0 });
        notifyComplete(element);
        return;
      }

      active = true;
      element.style.visibility = "visible";
      const left = clamp(rect.left, 8, Math.max(8, window.innerWidth - 32));
      const top = clamp(rect.top, 8, Math.max(8, window.innerHeight - 38));
      const topLeft = cursorPoint(left, top);

      // Approach the target before drawing its wireframe.
      await waitForTimeline(renderer.moveNaturally(CURSOR_ID, topLeft, {
        duration: TIMING.glide, ease: EASE, curvature: 0.12
      }));
      if (!alive) return;

      const guide = makeGuide(rect);
      const corners = [
        cursorPoint(rect.left + 1, rect.top + 1),
        cursorPoint(rect.right - 1, rect.top + 1),
        cursorPoint(rect.right - 1, rect.bottom - 1),
        cursorPoint(rect.left + 1, rect.bottom - 1),
        cursorPoint(rect.left + 1, rect.top + 1)
      ];

      // The cursor traces the perimeter while the pink outline draws.
      const drawTimeline = gsap.timeline();
      drawTimeline.fromTo(guide.outline,
        { strokeDashoffset: guide.perimeter },
        { strokeDashoffset: 0, duration: TIMING.draw, ease: EASE }
      );
      const cursorDraw = renderer.moveSequence(CURSOR_ID, corners.map((point) => ({
        to: point, duration: TIMING.draw / corners.length, ease: EASE, curvature: 0
      })), { ease: EASE, curvature: 0 });
      await Promise.all([waitForTimeline(drawTimeline), waitForTimeline(cursorDraw)]);
      if (!alive) return;

      // Let the wireframe read clearly before revealing any real content.
      await new Promise((resolve) => gsap.delayedCall(TIMING.wireframeHold, resolve));
      await new Promise((resolve) => gsap.delayedCall(TIMING.revealPause, resolve));
      if (!alive) return;

      await waitForTimeline(gsap.to(element, {
        autoAlpha: 1,
        y: 0,
        duration: TIMING.contentReveal,
        ease: EASE,
        overwrite: "auto"
      }));
      element.classList.remove("cursorbuild-unbuilt");
      if (!alive) return;

      await waitForTimeline(gsap.to(guide.svg, {
        opacity: 0,
        duration: TIMING.guideFade,
        ease: EASE
      }));
      guide.svg.remove();
      guides.delete(guide.svg);
      active = false;
      notifyComplete(element);
    };

    const pump = async () => {
      if (active || !alive) return;
      const next = queue.shift();
      if (!next) return;
      try {
        await buildOne(next);
      } catch (error) {
        console.error("[CursorBuild] Section construction failed:", error);
        if (next?.isConnected) {
          next.classList.remove("cursorbuild-unbuilt");
          gsap.set(next, { autoAlpha: 1, y: 0 });
        }
        active = false;
        notifyComplete(next);
      }
      if (alive) pump();
    };

    const onConstruct = (event) => {
      const target = event.detail?.target;
      if (!(target instanceof HTMLElement) || !target.isConnected || queued.has(target)) return;
      queued.add(target);
      queue.push(target);
      pump();
    };

    window.addEventListener("cursorbuild:construct", onConstruct);
    return () => {
      alive = false;
      window.cancelAnimationFrame(trailFrame);
      window.removeEventListener("cursorbuild:construct", onConstruct);
      guides.forEach((guide) => guide.remove());
      guides.clear();
      gsap.killTweensOf(trail);
      trail.remove();
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer cursorbuild-landing-only" aria-hidden="true" />;
}
