# CursorBuild integration — Chucks storefront

This branch is the isolated integration and deployment candidate for the Chucks Digital Storefront. The production `main` branch and current live deployment remain unchanged.

## Integrated engines

- **Cinematic animation:** vendored CursorBuild `CinematicAnimationEngine` drives existing landing and shopping-page entrance animations.
- **Cursor rendering:** `CursorManager` and `CursorRenderer` render two branded, non-interactive pointer identities on fine-pointer desktop devices. Click feedback is visual only; it does not dispatch browser click events or interfere with shopping controls.
- **Multi-cursor coordination:** `MultiCursorCoordinationEngine` synchronizes the visitor and Chucks-guide click feedback as coordinated actions.
- **Scroll construction:** `ScrollConstructionEngine` with GSAP ScrollTrigger drives selected section and product reveals as the visitor scrolls.
- **Accessibility and cleanup:** motion engines respect `prefers-reduced-motion`; touch/coarse-pointer devices do not display simulated cursors; effects and listeners are cleaned up on unmount.

## Files

- `lib/cursorbuild/` — vendored CursorBuild engine source used by the storefront.
- `app/components/CursorBuildMotion.jsx` — cinematic entrance animations.
- `app/components/CursorBuildPointers.jsx` — cursor renderer and coordinated click feedback.
- `app/components/CursorBuildScroll.jsx` — scroll-driven construction scenes.
- `app/layout.jsx` — mounts the client-side integrations.
- `app/globals.css` — renderer styling.

## Validation

The GitHub Actions workflow installs dependencies and runs the Next.js production build on pushes to this branch. A successful build verifies compilation and static generation; it does not replace a final browser review on desktop and mobile.

Recommended review before production deployment:
1. Open the landing page and `/shop` on desktop; confirm both branded pointers track the mouse and click feedback is subtle.
2. Scroll through departments, products, collections and services; confirm reveals run smoothly and reverse naturally.
3. Enable reduced motion in the operating system/browser; confirm content remains visible without motion.
4. Open the site on a touch phone; confirm the simulated pointers are absent and all shopping interactions still work.
5. Confirm the bag, navigation, search and other existing storefront interactions remain unchanged.

## Updating the vendored engine

The vendored files are copied from `suleiman2799-svg/cursorbuild` main. When updating them, compare the upstream APIs and preserve source attribution. No npm publishing, token, or external package release is required; GSAP is installed as a normal project dependency.
