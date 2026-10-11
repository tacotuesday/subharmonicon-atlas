# Subharmonicon Explorer

A browser-only rhythm and pitch visualizer for the Moog Subharmonicon. Turn virtual knobs, assign rhythms, patch control signals, and see six oscillator lanes alongside an expandable rhythm breakdown. No audio, account, server, or hosting service is required.

## Run locally

Use Node.js **22.18 or newer** and npm.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The app starts paused. Its demo assigns Rhythm 1 ÷2 to Sequencer 1 and Rhythm 2 ÷3 to both sequencers, at 120 BPM.

### Open as a file, without a server

After `npm run build`, open `dist/standalone.html` directly in your browser. This self-contained file includes the app code, styles, and icon. Opening the project’s `index.html` or `dist/index.html` as a local file also launches this standalone build. Rebuild after source edits to update it.

Sharing file-based URLs is useful only on the same computer; use the hosted URL for links other musicians can open. Browser restrictions on local-file saving/clipboard access are handled by the export and copy fallbacks.

## Build and verify

```sh
npm test
npm run build
npm run preview
```

`dist/` contains the entire deployable app. Vite uses `base: './'`, so the same build works at a domain root or a repository subpath. The app has no client-side path router; shared patches live in URL fragments.

Tests cover the reference ÷2/÷3 union, coincident pulses, clock endpoints, sequencing, pitch inheritance and normalled CV, quantization, divider modulation, gates and holds, immutable projections, live-edit scheduling, history retention, and configuration validation/persistence.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` tests and builds pull requests, and deploys pushes to `main` or a manual workflow run.

1. Create a GitHub repository and push this source, including `package-lock.json`, to its `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Push to `main`, or run **Test and deploy GitHub Pages** from the Actions tab.
4. Once the deployment finishes, open the URL shown by the deployment job: normally `https://<username>.github.io/<repository>/`.

The workflow uploads `dist/` directly using GitHub’s Pages actions. There are no site credentials or environment variables to configure. A different static host can publish the contents of `dist/` with `npm run build` as its build command.

Repository creation and initial publication have not been performed by this implementation. See [GitHub’s custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Explore the instrument

- **Knobs:** Drag vertically. Shift slows the movement. Arrow keys adjust; Enter opens direct entry. Rhythm and suboscillator dividers reach ÷1 at their clockwise end. Sequencer step values are normalized −1 to +1 and multiplied by the selected octave range.
- **Knob scales:** Sequencer knobs have 11 marks; frequency, tempo, and envelope knobs have 9. Divider knobs have 17 equally spaced marks, with the ninth at twelve o’clock. The 16 valid divisions snap to the nearest mark; the center mark is the reference between ÷8 and ÷9. Level and filter knobs have 11 major marks with four minor marks between each pair. Both VCO frequency knobs use a linear Hz display from 262–4,186 Hz, with 2,224 Hz at twelve o’clock; readouts show the initial knob setting before quantization, sequencer and patched modulation. This linear display is a visualization choice, rather than a measured hardware taper.
- **Assignments:** The buttons under each rhythm choose its sequencer destinations. OSC/SUB buttons choose what each sequencer controls. Suboscillators inherit their parent pitch even with their own SUB assignment off.
- **Transport:** PLAY starts/stops; RESET returns both sequences to Step 1 and resets divided-clock phase; holding RESET holds the sequence positions while rhythm triggers continue. NEXT manually advances assigned sequences. EG toggles automatic trigger requests; hold it or press H to hold the shared gate open. TRIGGER requests the shared envelopes; with EG off, its held state represents a sustained gate.
- **Cables:** Drag an enabled output to an input, or click an output and then an input. Each jack accepts one cable; a new cable replaces connections occupying either endpoint. Select a cable and press Delete, use the removal button, or expand the cable list. Escape cancels a pending connection.
- **Live edits:** Knob, assignment, and cable edits enter at the next clock boundary during playback. Stopped edits apply immediately. Reset does not erase recorded history.
- **Timeline:** Six rows represent the two VCOs and their four subs. Filled cells show pitch updates, a dot distinguishes updates retaining the same pitch, and held notes use a horizontal mark. Triangle markers show shared envelope-trigger requests. Click a cell for pitch, sequencer step, rhythm contributors, and routing details.
- **Windows:** Start with 16 clock pulses; choose 12/16/24/48/96. Follow the playhead or navigate recorded/future windows. Retain up to 4,096 actual pulses; future cells are simulated from a copied runtime. Playback pauses when the tab is hidden.
- **Rhythm breakdown:** Individual rhythm pulses are purple; combined sequencer streams are teal. Simultaneous divisions advance a sequencer once. ÷2 plus ÷3 gives pulses **2, 3, 4, 6, 8, 9, 10, 12** over twelve clocks.

## Save and share

The last configuration is saved in this browser. **Export** offers a versioned JSON download and a copyable JSON preview; **Import** validates it before replacing the current patch. **Share patch** creates a URL containing the configuration, without sending it to a server. A shared URL takes precedence over local storage, followed by the demo. Loaded patches start paused at Step 1. Runtime, history, and running status are never imported.

If local storage or clipboard access is unavailable, the app still works: copy the patch JSON, export a file, or copy the selected share URL manually. Malformed imports and unsupported cable connections leave the current configuration intact.

## Model boundaries

This is an independent educational control model, based on the [Moog Subharmonicon user manual](https://cdn.inmusicbrands.com/Moog/Subharmonicon/Subharmonicon_Manual%20AMZ.pdf). It is not affiliated with Moog Music and does not emulate an analog circuit or the instrument’s sound.

Supported control routes:

| Outputs | Inputs |
| --- | --- |
| SEQ 1, SEQ 2 CV | VCO 1/2 frequency, VCO 1/2 SUB, RHYTHM 1–4 |
| CLOCK, SEQ 1/2 CLK, TRIGGER | PLAY, RESET, TRIGGER |

Direct TRIGGER feedback is rejected. Audio, envelope, timbre, MIDI, and external CLOCK connections are displayed but inactive. Hidden global settings and MIDI configuration are omitted. Trigger markers show requests; envelope shapes and attack-stage suppression are not simulated.

Explicit idealizations:

- Divider CV: `clamp(round(base divisor − 1.5 × volts), 1, 16)`. Positive CV moves toward ÷1. A VCO SUB input modulates both sub divisors. Rhythm modulation samples the preceding sequencer step at each clock boundary.
- CLOCK uses 50% duty; SEQ CLK and TRIGGER outputs use 1 ms pulses. Gate edges are chronological; reset wins simultaneous advancement.
- Pitch control is 1 V/octave, including summed internal and patched CV. The VCO 1 pitch input normals to VCO 2 unless VCO 2 has its own cable. Internal pitch is limited to approximately 10 kHz; external CV is added afterward. Sub frequency is parent frequency divided by its integer divisor.
- Equal-tempered modes use chromatic or C-major steps. Just modes use conventional C-rooted five-limit ratios: `1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8`, with major degrees selected for the eight-tone mode and the octave repeated.
- Rhythm repetition is distinct from full four-step sequence repetition. CV-modulated rhythm divisions are marked variable; PLAY/RESET patching makes the complete sequence cycle gate-controlled.

The voltage-to-divider mapping and JI ratios are stated approximations, not a claim of measured hardware calibration.

## Source structure

`src/contracts.ts` defines shared configuration, runtime, action, frame, and panel interfaces. The pure `src/engine/` simulation produces values for `src/panel/` and `src/timeline/`; those UI subsystems do not duplicate instrument logic. `src/app/` owns scheduling, validation, and persistence. `src/App.tsx` integrates the experience.

All graphics are native CSS/SVG. Production dependencies are bundled locally, without external fonts or image requests.
