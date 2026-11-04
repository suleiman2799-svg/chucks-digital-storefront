# CursorBuild integration — Chucks storefront

This branch is the isolated integration test for the Chucks Digital Storefront.

## Current integration

- The cinematic animation engine is vendored from `suleiman2799-svg/cursorbuild` under `lib/cursorbuild/`.
- `app/components/CursorBuildMotion.jsx` mounts the real CursorBuild `CinematicAnimationEngine` on selected existing Chucks sections.
- The integration respects the user's reduced-motion preference and cleans up timelines on unmount.
- The production `main` branch and live deployment are not changed by this branch.

## Test scope

1. Confirm the Next.js production build.
2. Confirm section entrance/stagger animations on desktop and mobile.
3. Confirm reduced-motion behavior.
4. Continue with cursor renderer, multi-cursor coordination, and scroll-construction integration only after the first build is verified.

## Updating the vendored engine

The vendored source currently corresponds to the CursorBuild main branch at the time this integration was added. When updating it, preserve the source attribution and compare behavior against the upstream implementation.
