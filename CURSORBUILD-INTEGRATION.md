# CursorBuild integration — Chucks storefront

This branch is the isolated integration and deployment candidate for the Chucks Digital Storefront. The production `main` branch and current live deployment remain unchanged.

## Integrated engines

- **Cinematic animation:** vendored CursorBuild `CinematicAnimationEngine` drives the shop's above-the-fold entrance animations.
- **Cursor rendering:** `CursorManager` and `CursorRenderer` render twelve black, unlabeled construction cursors on the landing page only. They remain hidden while idle, stage beside a target, travel to its resize handle, and disappear after each construction pass.
- **Multi-cursor coordination:** `MultiCursorCoordinationEngine` synchronizes the visitor and Chucks-guide click feedback as coordinated actions.
- **Scroll construction:** `ScrollConstructionEngine` with GSAP ScrollTrigger controls landing-page reveals. As each target enters the viewport, one of the available cursors travels to it, expands its real DOM box from a compact starting size, then clears its smart-guide frame.
- **Accessibility and cleanup:** motion engines respect `prefers-reduced-motion`; effects and listeners are cleaned up on unmount. The cursor overlay is non-interactive and does not intercept shopping controls.

## Files

- `lib/cursorbuild/` — vendored CursorBuild engine source used by the storefront.
- `app/components/CursorBuildMotion.jsx` — cinematic entrance animations for the shop's above-the-fold content.
- `app/components/CursorBuildPointers.jsx` — cursor renderer, real pointer tracking, and scroll-construction choreography.
- `app/components/CursorBuildScroll.jsx` — scroll-driven reveal scenes and construction events.
- `app/page.jsx` — mounts all cursor construction effects exclusively on `/`; `/shop` remains cursor-free.
- `app/globals.css` — renderer styling.

## Validation

The GitHub Actions workflow installs dependencies and runs the Next.js production build on pushes to this branch. A successful build verifies compilation and static generation; it does not replace a final browser review on desktop and mobile.

Recommended review before production deployment:
1. Open the landing page and scroll through the introduction, three department cards, invitation and footer; verify the reveal progress is scroll-linked and the black cursors travel to each target, resize it, then disappear with their guides.
2. Open `/shop` and verify no construction cursors or guides appear.
3. Enable reduced motion in the operating system/browser; confirm content remains visible without motion.
4. Test on a touch phone; the simulated cursors should follow touch input and perform the same scroll-construction passes.
5. Confirm the bag, navigation, search and other existing storefront interactions remain unchanged.

## Updating the vendored engine

The vendored files are copied from `suleiman2799-svg/cursorbuild` main. When updating them, compare the upstream APIs and preserve source attribution. No npm publishing, token, or external package release is required; GSAP is installed as a normal project dependency.
