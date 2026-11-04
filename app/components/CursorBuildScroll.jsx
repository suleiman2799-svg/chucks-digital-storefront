"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

const BUILD_SELECTORS = [
  // First wave: one dedicated designer per key hero element.
  ".arrival-copy .arrival-logo-reveal",
  ".arrival-nav .arrival-nav-links a:nth-child(1)",
  ".arrival-nav .arrival-nav-links a:nth-child(2)",
  ".arrival-nav .arrival-nav-links a:nth-child(3)",
  ".arrival-nav .arrival-nav-cta",
  ".arrival-copy h1",
  ".arrival-copy > p",
  ".arrival-hero-video",
  ".arrival-hero .architecture",
  ".arrival-coordinate",
  ".arrival-orbit",
  ".hero-bottomline",
  // Remaining team members take the supporting hero details and next sections.
  ".arrival-nav .arrival-brand",
  ".arrival-copy .arrival-kicker",
  ".arrival-copy .arrival-actions",
  ".arrival-hero .marker-a",
  ".arrival-hero .marker-b",
  ".vertical-note",
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
  ".arrival-footer .arrival-credit"
];

export default function CursorBuildScroll() {
  useEffect(() => {
    const elements = [];
    const seen = new WeakSet();
    BUILD_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      });
    });

    elements.forEach((element) => {
      element.classList.add("cursorbuild-unbuilt");
      gsap.set(element, { autoAlpha: 0, y: 12 });
    });

    const demoMode = new URLSearchParams(window.location.search).get("cursorbuild") === "demo";
    let observer;
    let demoLocked = false;
    const blockDemoScroll = (event) => {
      if (demoLocked) event.preventDefault();
    };
    const blockDemoKeys = (event) => {
      if (demoLocked && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        event.preventDefault();
      }
    };
    const waitForScrollToSettle = (element) => new Promise((resolve) => {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      let previousY = window.scrollY;
      let stableFrames = 0;
      let frames = 0;
      const check = () => {
        frames += 1;
        const currentY = window.scrollY;
        stableFrames = Math.abs(currentY - previousY) < 0.5 ? stableFrames + 1 : 0;
        previousY = currentY;
        if (stableFrames >= 5 || frames >= 240) resolve();
        else window.requestAnimationFrame(check);
      };
      window.requestAnimationFrame(check);
    });
    const waitForBuildGroup = (group) => new Promise((resolve) => {
      // Preserve the page's visual reading order: top row first, then lower rows.
      // The same seven cursor workers share the task queue for the whole section.
      group.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const rowTolerance = 18;
        if (Math.abs(ar.top - br.top) > rowTolerance) return ar.top - br.top;
        return ar.left - br.left;
      });
      window.dispatchEvent(new CustomEvent("cursorbuild:section-start"));
      let remaining = group.length;
      if (!remaining) return resolve();
      const completed = new Set();
      const onComplete = (event) => {
        const target = event.detail?.target;
        if (!group.includes(target) || completed.has(target)) return;
        completed.add(target);
        remaining -= 1;
        if (remaining <= 0) {
          window.removeEventListener("cursorbuild:complete", onComplete);
          window.dispatchEvent(new CustomEvent("cursorbuild:section-complete"));
          resolve();
        }
      };
      window.addEventListener("cursorbuild:complete", onComplete);
      group.forEach((target) => window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
        detail: { target }
      })));
    });

    if (demoMode) {
      window.addEventListener("wheel", blockDemoScroll, { passive: false });
      window.addEventListener("touchmove", blockDemoScroll, { passive: false });
      window.addEventListener("keydown", blockDemoKeys);
      const groups = new Map();
      elements.forEach((element) => {
        const section = element.closest("header, section, footer") || document.body;
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(element);
      });
      window.requestAnimationFrame(async () => {
        for (const [section, group] of groups) {
          if (!section.isConnected) continue;
          await waitForScrollToSettle(group[0]);
          demoLocked = true;
          await waitForBuildGroup(group);
          demoLocked = false;
        }
      });
    } else if ("IntersectionObserver" in window) {
      const groups = new Map();
      elements.forEach((element) => {
        const section = element.closest("header, section, footer") || document.body;
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(element);
      });
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const group = groups.get(entry.target) || [];
          waitForBuildGroup(group);
        });
      }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      groups.forEach((_, section) => observer.observe(section));
    } else {
      const groups = new Map();
      elements.forEach((element) => {
        const section = element.closest("header, section, footer") || document.body;
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(element);
      });
      groups.forEach((group) => waitForBuildGroup(group));
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("wheel", blockDemoScroll);
      window.removeEventListener("touchmove", blockDemoScroll);
      window.removeEventListener("keydown", blockDemoKeys);
      elements.forEach((element) => {
        element.classList.remove("cursorbuild-unbuilt");
        gsap.set(element, { clearProps: "opacity,visibility,transform" });
      });
    };
  }, []);

  return null;
}
