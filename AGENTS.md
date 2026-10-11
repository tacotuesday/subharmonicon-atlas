# Subharmonicon Explorer

This is a static React/TypeScript/Vite educational control model. There is no audio engine or backend. Read the README for the scope, model approximations, controls, and GitHub Pages setup.

## Commands

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Use Node 22.18+. `npm test` uses Node’s native TypeScript stripping. `npm run build` checks types and produces `dist/`; generated output is ignored.

## Boundaries

- `src/contracts.ts`, `src/defaults.ts`, and `src/jacks.ts` define shared contracts and routing. Coordinate interface changes before parallel subsystem work.
- `src/engine/` alone calculates instrument behavior. Keep it pure and testable.
- `src/panel/` owns instrument controls/cables; `src/timeline/` renders supplied simulation frames.
- `src/app/` owns live-edit scheduling, history, configuration validation, and persistence. Runtime/history never enter saved patches.
- Preserve documented normalled connections, clockwise ÷1 controls, OR coalescing, and explicit idealizations. Do not claim measured analog equivalence.
- Preserve relative asset paths and URL-fragment sharing so deployment works under repository paths.

Run relevant deterministic tests for behavior changes and the production build for app changes. Inspect affected UI interactions, responsive layout, and keyboard access. Do not create repositories or publish the app unless the user requests those actions.
