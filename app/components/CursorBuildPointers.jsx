"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { CursorManager } from "../../lib/cursorbuild/cursor-manager";
import { CursorRenderer } from "../../lib/cursorbuild/cursor-renderer";

const EASE = "power3.out";
const TIMING = {
  glide: 0.3,
  draw: 0.4,
  wireframeHold: 0.25,
  contentReveal: 0.3,
  guideFade: 0.25
};
const TEAM = [
  ["designer", "#c83a8f"],
  ["jide", "#3978e8"],
  ["ada", "#e3a82b"],
  ["chucks", "#19a66a"],
  ["figma", "#8b5cf6"],
  ["tobi", "#ed6b45"],
  ["zara", "#12a6a6"],
  ["kunle", "#d94f91"],
  ["mira", "#6585c8"],
  ["nora", "#8b9b31"],
  ["deji", "#bd6b2d"],
  ["ife", "#6c59b8"],
  ["simi", "#249c83"],
  ["ken", "#d45d5d"],
  ["tade", "#5476a8"],
  ["lola", "#a45c91"]
];

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

    const mobile = window.matchMedia("(max-width: 600px)").matches;
    const cursorCount = 16;
    const team = TEAM.slice(0, cursorCount);
    const manager = new CursorManager();
    team.forEach(([name, color], index) => manager.add({
      id: `designer-${index + 1}`,
      name,
      color
    }));

    const initialPositions = {};
    team.forEach((_, index) => {
      const columns = mobile ? 3 : 4;
      initialPositions[`designer-${index + 1}`] = {
        x: 14 + (index % columns) * (mobile ? 68 : 82),
        y: 14 + Math.floor(index / columns) * 44
      };
    });

    const renderer = new CursorRenderer(manager, host, {
      maxVisible: 16,
      tabletMaxVisible: 16,
      mobileMaxVisible: 16,
      touchMaxVisible: 16,
      duration: TIMING.glide,
      ease: EASE,
      naturalMovement: { duration: TIMING.glide, ease: EASE, curvature: 0.1 },
      initialPositions,
      respectReducedMotion: false,
      clickFeedback: { style: "ripple-press", duration: 0.24, intensity: 0.42 }
    });

    const cursorNodes = team.map((_, index) =>
      host.querySelector(`.cursorbuild-cursor[data-cursor-id="designer-${index + 1}"]`)
    );
    const trails = cursorNodes.map(() => {
      const trail = document.createElement("span");
      trail.className = "cursorbuild-motion-trail";
      host.appendChild(trail);
      return trail;
    });

    const guides = new Set();
    const queues = team.map(() => []);
    const busy = team.map(() => false);
    const queuedTargets = new WeakSet();
    let assignmentIndex = 0;
    let alive = true;
    let trailFrame = 0;
    let sectionActive = false;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const cursorPoint = (x, y) => ({
      x: clamp(x, 8, Math.max(8, window.innerWidth - 34)),
      y: clamp(y, 8, Math.max(8, window.innerHeight - 40))
    });
    const notifyComplete = (target) => {
      window.dispatchEvent(new CustomEvent("cursorbuild:complete", { detail: { target } }));
    };

    const updateTrails = () => {
      if (!alive) return;
      cursorNodes.forEach((node, index) => {
        if (!node) return;
        const x = Number(gsap.getProperty(node, "x")) || 0;
        const y = Number(gsap.getProperty(node, "y")) || 0;
        trails[index].style.transform = `translate3d(${x + 7}px,${y + 13}px,0)`;
        trails[index].style.opacity = sectionActive ? (busy[index] ? "0.38" : "0.16") : "0";
      });
      trailFrame = window.requestAnimationFrame(updateTrails);
    };
    trailFrame = window.requestAnimationFrame(updateTrails);

    const makeGuide = (rect, color) => {
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
      svg.style.setProperty("--cursorbuild-guide-color", color);

      const perimeter = Math.max(1, 2 * (width + height));
      const outline = document.createElementNS(svg.namespaceURI, "rect");
      outline.setAttribute("x", "1");
      outline.setAttribute("y", "1");
      outline.setAttribute("width", String(Math.max(1, width - 2)));
      outline.setAttribute("height", String(Math.max(1, height - 2)));
      outline.setAttribute("rx", "2");
      outline.setAttribute("fill", "none");
      outline.setAttribute("stroke", color);
      outline.setAttribute("stroke-width", "1.5");
      outline.setAttribute("stroke-dasharray", String(perimeter));
      outline.setAttribute("stroke-dashoffset", String(perimeter));
      outline.classList.add("cursorbuild-wireframe-outline");
      svg.appendChild(outline);

      const isMobile = window.matchMedia("(max-width: 650px)").matches;
      const lineSpecs = isMobile
        ? [[width * 0.5, 0, width * 0.5, height]]
        : [[width * 0.33, 0, width * 0.33, height],
           [width * 0.66, 0, width * 0.66, height],
           [0, height * 0.5, width, height * 0.5]];
      lineSpecs.forEach(([x1, y1, x2, y2]) => {
        const line = document.createElementNS(svg.namespaceURI, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "0.8");
        line.setAttribute("stroke-opacity", isMobile ? "0.24" : "0.3");
        line.setAttribute("stroke-dasharray", "3 5");
        line.classList.add("cursorbuild-wireframe-detail");
        svg.appendChild(line);
      });

      host.appendChild(svg);
      guides.add(svg);
      return { svg, outline, perimeter };
    };

    const buildOne = async (element, cursorIndex) => {
      if (!alive || !element?.isConnected) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        element.classList.remove("cursorbuild-unbuilt");
        gsap.set(element, { autoAlpha: 1, y: 0 });
        notifyComplete(element);
        return;
      }

      const cursorId = `designer-${cursorIndex + 1}`;
      const color = "#c83a8f";
      const topLeft = cursorPoint(rect.left + 1, rect.top + 1);
      const corners = [
        topLeft,
        cursorPoint(rect.right - 1, rect.top + 1),
        cursorPoint(rect.right - 1, rect.bottom - 1),
        cursorPoint(rect.left + 1, rect.bottom - 1),
        topLeft
      ];

      // Every team member starts its own element build immediately.
      element.style.visibility = "visible";
      await waitForTimeline(renderer.moveNaturally(cursorId, topLeft, {
        duration: TIMING.glide, ease: EASE, curvature: 0.1
      }));
      if (!alive) return;

      const guide = makeGuide(rect, color);
      const drawTimeline = gsap.timeline();
      drawTimeline.fromTo(guide.outline,
        { strokeDashoffset: guide.perimeter },
        { strokeDashoffset: 0, duration: TIMING.draw, ease: EASE }
      );
      const cursorDraw = renderer.moveSequence(cursorId, corners.slice(1).map((point) => ({
        to: point,
        duration: TIMING.draw / 4,
        ease: EASE,
        curvature: 0
      })), { ease: EASE, curvature: 0 });
      await Promise.all([waitForTimeline(drawTimeline), waitForTimeline(cursorDraw)]);
      if (!alive) return;

      await new Promise((resolve) => gsap.delayedCall(TIMING.wireframeHold, resolve));
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
      notifyComplete(element);
    };

    const pump = async (cursorIndex) => {
      if (busy[cursorIndex] || !alive) return;
      const next = queues[cursorIndex].shift();
      if (!next) return;
      busy[cursorIndex] = true;
      try {
        await buildOne(next, cursorIndex);
      } catch (error) {
        console.error("[CursorBuild] Team member construction failed:", error);
        if (next?.isConnected) {
          next.classList.remove("cursorbuild-unbuilt");
          gsap.set(next, { autoAlpha: 1, y: 0 });
        }
        notifyComplete(next);
      }
      busy[cursorIndex] = false;
      if (alive && queues[cursorIndex].length) pump(cursorIndex);
    };

    const onSectionStart = () => {
      sectionActive = true;
      host.classList.remove("cursorbuild-team-finished");
      gsap.to([...cursorNodes, ...trails].filter(Boolean), {
        autoAlpha: 1, duration: 0.2, ease: "power2.out", overwrite: true
      });
    };
    const onSectionComplete = () => {
      sectionActive = false;
      host.classList.add("cursorbuild-team-finished");
      gsap.to([...cursorNodes, ...trails].filter(Boolean), {
        autoAlpha: 0, duration: 0.4, ease: "power2.out", overwrite: true
      });
    };

    const onConstruct = (event) => {
      const target = event.detail?.target;
      if (!(target instanceof HTMLElement) || !target.isConnected || queuedTargets.has(target)) return;
      queuedTargets.add(target);
      const cursorIndex = assignmentIndex++ % team.length;
      queues[cursorIndex].push(target);
      pump(cursorIndex);
    };

    window.addEventListener("cursorbuild:construct", onConstruct);
    window.addEventListener("cursorbuild:section-start", onSectionStart);
    window.addEventListener("cursorbuild:section-complete", onSectionComplete);
    return () => {
      alive = false;
      window.cancelAnimationFrame(trailFrame);
      window.removeEventListener("cursorbuild:construct", onConstruct);
      window.removeEventListener("cursorbuild:section-start", onSectionStart);
      window.removeEventListener("cursorbuild:section-complete", onSectionComplete);
      guides.forEach((guide) => guide.remove());
      guides.clear();
      trails.forEach((trail) => trail.remove());
      gsap.killTweensOf(trails);
      renderer.destroy();
      manager.destroy();
    };
  }, []);

  return <div ref={hostRef} className="cursorbuild-pointer-layer cursorbuild-landing-only" aria-hidden="true" />;
}
