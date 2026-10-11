# Subharmonicon Atlas

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

## Session progress — 2026-10-11

- Implemented the static app with a pure TypeScript simulation, six oscillator/suboscillator lanes, rhythm breakdown, playback, virtual control patching, and configuration saving, JSON import/export, and URL-fragment sharing. Timbre controls remain visual only.
- Default timeline windows show 16 pulses, with 12/16/24/48/96 available. Playback retains 4,096 historical pulses; future previews use copied runtime state.
- Refined the instrument panel: added label spacing, removed section boxes and the center divider, and replaced duplicate knob markings with a single scale. Divider knobs have 17 equally spaced marks with the ninth at twelve o’clock; sequencer knobs have 11, frequency/tempo/envelope knobs have 9, and level/filter knobs have 11 major marks with four minor marks between each pair.
- Divider pointers snap to the nearest scale mark for each valid division; the center mark lies between ÷8 and ÷9. Both VCO frequency controls display a linear 262–4,186 Hz range with 2,224 Hz at twelve o’clock. This display taper is a visualization choice, not measured hardware behavior.
- Recreated the three-position VCO waveform switches using mechanical-style SVGs and square, sawtooth, and mixed waveform icons, informed by the Moog manual and product photographs. They remain inactive because timbre emulation is outside scope.
- Fixed local-file launching: after a build, the source `index.html` redirects to the self-contained `dist/standalone.html`. Rebuild after source edits. The standalone build was verified over HTTP; direct `file://` navigation could not be automated with the browser tool.
- Verified desktop/mobile layouts and panel interactions. All 26 deterministic tests and the production build passed before the initial app commit.
- Initialized this directory as a Git repository, preserved the remote’s initial commit, and pushed app commit `9fc702c` to `main` at `https://github.com/tacotuesday/subharmonicon-atlas.git`. The GitHub Pages workflow is included; successful public deployment has not been confirmed.
- The repository is named Subharmonicon Atlas; the app’s visible branding still says Subharmonicon Explorer. MIT was recommended for free reuse with retained copyright/license notices, but no license file has been added.

## Commit review and pushing

The user requested local commit review before pushing to `main`. Prepare and commit authorized changes, present the commit and its summary for approval, and wait for explicit approval before pushing. Do not treat the earlier authorization to sync the initial app as approval for subsequent pushes.
