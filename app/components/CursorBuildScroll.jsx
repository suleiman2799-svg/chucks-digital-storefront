"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

const BUILD_SELECTORS = [
  ".arrival-nav .arrival-brand",
  ".arrival-nav .arrival-nav-links",
  ".arrival-nav .arrival-nav-cta",
  ".arrival-coordinate",
  ".arrival-orbit",
  ".arrival-hero-video",
  ".arrival-copy .arrival-logo-reveal",
  ".arrival-copy .arrival-kicker",
  ".arrival-copy h1",
  ".arrival-copy > p",
  ".arrival-copy .arrival-actions",
  ".arrival-hero .architecture",
  ".arrival-hero .marker-a",
  ".arrival-hero .marker-b",
  ".hero-bottomline",
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
    const waitForBuild = (element) => new Promise((resolve) => {
      const onComplete = (event) => {
        if (event.detail?.target !== element) return;
        window.removeEventListener("cursorbuild:complete", onComplete);
        resolve();
      };
      window.addEventListener("cursorbuild:complete", onComplete);
      window.dispatchEvent(new CustomEvent("cursorbuild:construct", { detail: { target: element } }));
    });

    if (demoMode) {
      window.addEventListener("wheel", blockDemoScroll, { passive: false });
      window.addEventListener("touchmove", blockDemoScroll, { passive: false });
      window.addEventListener("keydown", blockDemoKeys);
      window.requestAnimationFrame(async () => {
        for (const element of elements) {
          if (!element.isConnected) continue;
          await waitForScrollToSettle(element);
          demoLocked = true;
          await waitForBuild(element);
          demoLocked = false;
        }
      });
    } else if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
            detail: { target: entry.target }
          }));
        });
      }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      elements.forEach((element) => observer.observe(element));
    } else {
      elements.forEach((element) => {
        window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
          detail: { target: element }
        }));
      });
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
