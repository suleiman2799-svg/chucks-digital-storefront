"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

const BUILD_SELECTORS = [
  ".arrival-nav .arrival-brand",
  ".arrival-nav .arrival-nav-links",
  ".arrival-nav .arrival-nav-cta",
  ".arrival-coordinate",
  ".arrival-orbit",
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
    if (demoMode) {
      document.documentElement.classList.add("cursorbuild-demo-lock");
      document.body.classList.add("cursorbuild-demo-lock");
      window.requestAnimationFrame(() => {
        elements.forEach((element) => {
          window.dispatchEvent(new CustomEvent("cursorbuild:construct", {
            detail: { target: element }
          }));
        });
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
      document.documentElement.classList.remove("cursorbuild-demo-lock");
      document.body.classList.remove("cursorbuild-demo-lock");
      elements.forEach((element) => {
        element.classList.remove("cursorbuild-unbuilt");
        gsap.set(element, { clearProps: "opacity,visibility,transform" });
      });
    };
  }, []);

  return null;
}
