# SignalPath — Design.md

**Audience:** the Antigravity agent working inside the SignalPath repo (Next.js 14.2.4 App Router + TypeScript + Tailwind + framer-motion + lucide-react, Clerk auth, FastAPI backend on `localhost:8000`).

**Two jobs, in this order:**

1. **Part 1 — Redesign the whole frontend** in the Torque operator-panel style (presentation only; no logic changes).
2. **Part 2 — Build the `/live` page**: live Hindi captions shown as Hinglish, 100% in the browser, no backend.

Read this whole file before touching code. Work in small steps, run `npm run build` after each step, and commit after each step.

---

## 0. Ground rules (apply to both parts)

- **Do not change** API contracts, route handlers, env var names, Clerk wiring, or anything under `backend/`. Part 1 is presentational. Part 2 adds new files and touches almost nothing existing.
- **Do not rewrite working logic.** Restyle components (`CaptionTrack`, `ConfidenceBadge`, `LanguagePicker`, `ProgressStages`, `UploadDropzone`, `VideoPlayer`, etc.) by changing markup/classes only. Keep their props and exports identical.
- **First, audit the real code.** The zip is the source of truth. List every page and component you find, then compare against the page list in section 1.6. If something differs, follow the code, not this file.
- **Disk is tight on the developer's machine.** Keep new dependencies minimal, never add a second copy of `node_modules`, and keep any video asset under 3 MB.
- **No invented numbers anywhere in the UI.** Stats must come from real repo facts or live API data. Anything measured on synthetic data must be labeled "synthetic".
- **Never hard-fail the UI.** Every page needs a loading state, an empty state and an error state.
- Finish with the Definition of Done checklist in section 3.

---

# PART 1 — Redesign in the Torque style

## 1.1 What "Torque style" means

The reference is the **Torque** garage/workshop admin template (saved from codeandchill.store). Its topic (vehicle garage) is irrelevant; copy its **operator-panel feel**: a warm, tactile, app-like admin shell, not a marketing template.

> If `design-demo.txt`, `index.txt` and `indexfloor.txt` are in the workspace, **read them first**. They are the source of truth for exact CSS, component markup and motion code. Where they differ from the values below, follow the files and note the difference in your final report.

Signature elements to reproduce:

- **Shell:** sidebar + top bar. The sidebar is near-black with a **sliding orange nav pill** that glides to the active item.
- **Top bar:** search field with a **⌘K** command palette, theme toggle, user menu (Clerk).
- **Page header:** a **split-letter title** (each letter animates in) plus **magnetic buttons** (they lean toward the cursor).
- **Stat strip:** cards with **counting numbers** in Geist Mono, tabular figures.
- **Illustrated, animated cards** (the "bay cards" in Torque) with small SVG illustrations and live status.
- **Kanban lanes with step buttons** (move an item to the next stage with one click).
- **Ring / gauge / meter widgets** for scores and progress.
- **Activity feed**, **drawers and modals**, and **toasts with Undo**.
- **Fully pill-shaped controls**, 44px tall buttons.

### Mistakes to avoid (seen in earlier AI-generated UIs)

| Problem seen before | Rule now |
|---|---|
| Neon yellow accents | Only the accent set in 1.2 |
| Tiny body text | Body text at least 15px, transcripts and captions at least 17px |
| Extreme gaps between sections | Dense, app-like spacing: 16–24px gaps inside the shell, `py-16` max on any public page |
| Generic template look | Use the Torque components above, not stock shadcn defaults |
| Western brand references | Neutral or India-relevant examples only |

## 1.2 Design tokens (single source of truth)

Put these in `globals.css` as CSS variables, with a dark set under `[data-theme="dark"]`. Map them in `tailwind.config.ts`. **No hard-coded hex values in components.** If the Torque CSS files are available, copy their exact values over these.

```css
:root {
  /* surfaces */
  --paper: #ecebe6;            /* page background, with soft radial glows */
  --card: #fbfaf7;             /* off-white cards */
  --card-line: rgba(23,24,27,.08);   /* 1px hairline border */
  --sidebar: #17181b;          /* near-black sidebar */

  /* ink */
  --ink: #17181b;
  --ink-2: #4a4c52;
  --ink-3: #7b7d84;

  /* brand */
  --primary: #c2410c;          /* burnt orange: primary actions */
  --pill: #ff9a3c;             /* sliding nav pill on the sidebar */

  /* accents (used as tinted pills via color-mix) */
  --orange: #ea580c;
  --amber:  #d97706;
  --sky:    #0284c7;
  --teal:   #0d9488;
  --violet: #7c3aed;
  --rose:   #e11d48;
  --lime:   #65a30d;
  --slate:  #64748b;

  /* trust colors (must match backend buckets 0.75 / 0.50) */
  --trust-high: var(--teal);
  --trust-mid:  var(--amber);
  --trust-low:  var(--rose);

  --radius-card: 20px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 1px rgba(23,24,27,.04), 0 6px 18px rgba(23,24,27,.06), 0 18px 40px rgba(23,24,27,.05);
  --ease: cubic-bezier(.2,.8,.2,1);
}
[data-theme="dark"] { /* derive a dark set; keep orange pill and accents */ }

/* tinted pill pattern */
.pill-tint { background: color-mix(in srgb, var(--tone) 14%, transparent);
             color: color-mix(in srgb, var(--tone) 80%, var(--ink)); }
```

Trust tint backgrounds come from `color-mix` on the three trust colors, the same pattern as the accent pills.

**Typography** (load with `next/font`, or the `geist` package):

- **Geist** for UI and headings, **Geist Mono** for numbers, timestamps, IDs and stats.
- Tight negative letter-spacing on headings (about `-0.02em` to `-0.04em`), `font-variant-numeric: tabular-nums` on all numbers.
- Hindi/Devanagari text: **Noto Sans Devanagari**. Load other Indic Noto variants only where those scripts render.

**Theme:** light by default, dark via `data-theme="dark"` on `<html>`, toggled from the top bar and remembered in `localStorage` (wrapped in try/catch).

## 1.3 Motion system

Motion is **JS-driven; CSS only holds states.** Create `src/lib/motion.ts` and a few small hooks, and reuse them everywhere. Use `framer-motion` (already installed) where it fits, and plain JS (rAF, Web Animations API) for the nav pill, magnetic buttons and counters if that matches Torque's code better.

- **Sliding nav pill:** one absolutely positioned pill that animates to the active sidebar item's position and size.
- **Split-letter title:** split the heading into letter spans, stagger them in (about 20–30ms apart).
- **Magnetic buttons:** on pointer move near a button, translate it a few pixels toward the cursor, spring back on leave. Disabled on touch.
- **Counting numbers:** animate from 0 (or the previous value) to the target with the shared easing; format with tabular numerals.
- **Rings/gauges:** animate the stroke from 0 to the value.
- **Toasts with Undo:** an action toast with an Undo button that reverts the change within about 5 seconds.
- **Easing everywhere:** `cubic-bezier(.2,.8,.2,1)`.
- **Reduced motion:** when `prefers-reduced-motion` is set, skip letter splits, magnetic effects, counters and pill glide (jump straight to final values).

## 1.4 Layout and responsiveness

- **Desktop:** fixed sidebar (collapsible), top bar, content area on the paper background with soft radial glows.
- **Mobile:** the sidebar becomes a **floating bottom dock**; modals and drawers become **bottom sheets**.
- Page container `max-w-7xl`, cards use `--radius-card`, `--shadow-card` and a 1px hairline border.

## 1.5 Component library

Install shadcn/ui only as a base for accessibility primitives (`tabs`, `dialog`, `dropdown-menu`, `tooltip`, `sonner` or a custom toast, `command` for ⌘K) and **restyle everything to the tokens above**. Never leave shadcn defaults visible.

Map the existing SignalPath components to Torque patterns (keep props and exports identical, change markup and classes only):

| Existing component | Torque pattern |
|---|---|
| `ProgressStages` | Stage lanes with step buttons and a ring showing overall progress |
| `ConfidenceBadge` | Tinted pill (via `color-mix`) with a mono percentage, optionally with a small gauge |
| `CaptionTrack` | Words as small rounded spans tinted by trust, 17px+, tooltip with trust value and correction note |
| `UploadDropzone` | Large card with hairline dashed border, drag-over state tinted with `--primary` |
| `LanguagePicker` | Pill group with native-script labels (हिन्दी, मराठी, தமிழ், ਪੰਜਾਬੀ, ಕನ್ನಡ) |
| `VideoPlayer` | Card frame with the caption overlay and an English/native toggle |
| Job list items | Illustrated cards like the Torque bay cards, with status pill and trust meter |

## 1.6 Page-by-page brief

Audit the repo first and adapt if routes differ. All signed-in app pages live inside the shell (sidebar + top bar).

| Route | Brief |
|---|---|
| `/` | Public landing in the same visual language: paper background, split-letter hero title, magnetic primary button, URL paste box, a "how it works" row of illustrated cards for the pipeline, a sample caption with high/mid/low words. Count-up stats only from real repo facts (label synthetic ones). |
| `/dashboard` | Stat strip (jobs, languages, average trust, minutes processed) from real API data, recent jobs as illustrated cards, activity feed, a kanban view of jobs by stage (queued, processing, done) with step buttons where the API allows it. Skeletons while loading. |
| `/new` | Focused card with URL and Upload tabs, source and target language pickers, a magnetic submit button. Routes to `/jobs/[id]` on success. |
| `/jobs/[id]` | Processing: stage lanes plus a ring. Results: video player and synced caption track, trust legend, export buttons (SRT/VTT/TXT/JSON), a drawer for per-word details. Toast with Undo for reversible actions. |
| `/library` | ⌘K-aware search, filter pills, grid of illustrated job cards, empty state. |
| `/ocr` | Image drop area, extracted text panel with copy/download and per-line confidence. |
| `/status` | Gauge/meter cards per service (API, ASR, translation, OCR) with status dot and last-checked time. |
| Clerk sign-in/up | Clerk `appearance` prop with the tokens, centered card on the paper background. |
| `/live` | Built in Part 2, **standalone (no shell, not in the nav)**, but uses the same tokens, Geist fonts and pill controls. |

## 1.7 Part 1 execution order

1. Audit the repo and read any Torque files in the workspace. List routes, components and differences from 1.6.
2. Install only what is needed (shadcn primitives, `geist`, `cmdk` for ⌘K). Add tokens and fonts, light and dark.
3. Build the shell: sidebar with the sliding pill, top bar with ⌘K and theme toggle, mobile bottom dock, bottom-sheet modals and drawers.
4. Build `motion.ts` and the shared widgets: stat card with counter, ring/gauge, tinted pill, toast with Undo, split-letter title, magnetic button.
5. Restyle the shared SignalPath components from 1.5.
6. Redesign pages in this order: `/new`, `/jobs/[id]`, `/dashboard`, `/library`, `/ocr`, `/status`, `/`, auth pages.
7. Responsive pass at 360, 768 and 1280 px, then an accessibility pass (contrast of text on tinted pills, focus rings, keyboard navigation, ⌘K usable by keyboard).
8. `npm run build` and `npm run lint` must pass.

---

# PART 2 — The `/live` page (live Hindi → Hinglish, no backend)

## 2.1 Goal and hard constraints

A standalone page at `/live` where the user allows the microphone, speaks Hindi, and sees live text. The main output is **Hinglish**, meaning Hindi written in plain English letters the way people type in WhatsApp and reels (for example "dost", "mitra", "kya haal hai"), not textbook romanization with diacritics.

**Hard constraints:**

- **No backend.** Everything runs in the browser. No new API routes, no calls to FastAPI.
- **Latency:** the page must feel live. Our own processing between a speech result arriving and the text painting must stay under **50 ms**. Note for the owner: the speech recognizer itself (Chrome's Web Speech API) sets most of the delay, and that part is outside our control. Measure and report both numbers.
- **Standalone:** do not link it from the main nav or modify existing pages. Add it to Clerk's public routes so it works without sign-in (check `middleware.ts` and make `/live(.*)` public).
- **No crashes, ever.** Every failure path shows a friendly message and a way to retry (see 2.7).

## 2.2 Stack

| Need | Choice |
|---|---|
| Live Hindi text | `react-speech-recognition` (wraps the browser Web Speech API), language `hi-IN` |
| Tabs and UI | shadcn `tabs`, `card`, `badge`, `button`, `sonner`, `tooltip` |
| Fallback transliteration | `@indic-transliteration/sanscript` (Devanagari → ITRANS, then our cleanup rules) |
| Dictionary | Static JSON built offline (section 2.5), loaded once in the browser |
| Tests | `vitest` for the transliteration pipeline |

Implementation notes for `react-speech-recognition`:

- It only works in client components (`"use client"`). Do not touch `window` during server render.
- Import `regenerator-runtime/runtime` once in the live page if the build complains about `regeneratorRuntime`.
- Check the installed React peer-dependency range against Next 14's React 18. Only use `--legacy-peer-deps` if truly required, and say so in the final report.
- Call `browserSupportsSpeechRecognition()` **after mount** (in an effect) to avoid hydration mismatch.
- Start with `SpeechRecognition.startListening({ continuous: true, language: "hi-IN", interimResults: true })`.
- Chrome ends recognition after silence or a network blip. Handle the end event by restarting automatically with a short backoff (300 ms, then 600 ms, then 1.2 s, capped), unless the user pressed Stop or permission was denied.
- Browser support is best in Chrome and Edge. Safari is partial and Firefox lacks it. Detect and show the unsupported state instead of failing.
- Chrome's Web Speech API sends audio to Google's servers, so the page needs an internet connection and the UI should say so in one line.
- The library exposes `transcript`, `interimTranscript`, `finalTranscript` and `listening`. It does **not** expose per-word recognizer confidence, so the trust signal in this page comes from the lookup tier (section 2.4), not from the recognizer.

## 2.3 Page layout (shadcn Tabs)

A centered card on the `--paper` background using the Part 1 tokens. Header shows the page title, a one-line explainer, and the language chip "हिन्दी → Hinglish".

**Tabs:**

1. **Live** (default): large Hinglish text area (min 20px, line height 1.6) showing committed words in solid ink and the in-progress interim words in a lighter tone. Words are tinted by trust tier. Auto-scrolls to the newest line, pauses auto-scroll if the user scrolls up.
2. **Hindi**: the raw Devanagari text exactly as recognized, in Noto Sans Devanagari, same live behavior.
3. **Words**: a word-by-word inspector. Each row shows the Hindi word, the Hinglish output, the source tier (dictionary, rule, passthrough) and the trust badge. Includes a count of dictionary hits versus fallback hits.

**Controls bar (always visible):** a round pill-style mic button with pulse rings while listening, Start/Stop, Clear, Copy Hinglish, Download `.txt`. Show a small status chip: Idle, Listening, Reconnecting, Error.

**Optional audio level bars:** a thin level meter using the Web Audio `AnalyserNode` on a separate `getUserMedia` stream. This is a nice-to-have. Wrap it in try/catch and, if it conflicts with recognition or fails, fall back to a CSS-only animation. It must never affect captioning.

**Do not build** the Whisper "deep check" tab now. It is a possible future addition and is out of scope.

## 2.4 Conversion pipeline (runs on every word, in the browser)

```
Chrome result text
  → normalize (NFC, strip danda "।" and punctuation, collapse spaces)
  → split into tokens
  → per token:
      Latin token?          → passthrough (tier: "passthrough")
      in dictionary?        → dictionary spelling (tier: "dict")
      otherwise             → rules engine (Sanscript + cleanup) (tier: "rule")
  → join with spaces
```

**Trust tiers shown as color:**

| Tier | Color | Meaning |
|---|---|---|
| dict, passthrough | `--trust-high` | Spelling comes from the curated dictionary |
| rule | `--trust-mid` | Computed by rules (a name, rare word or new word) |
| rule with suspicious output (no vowel, over 14 characters, contains leftover ITRANS symbols) | `--trust-low` | Probably wrong, worth checking |

**Performance rules:**

- Convert **only new words**. Keep committed (final) words cached; re-convert only the interim tail on each interim event.
- Memoize `toHinglish(token)` with a plain `Map`.
- Never block the main thread on the dictionary: load it asynchronously on page open (before the mic starts). While it is loading, the rules engine still works, and the UI shows a small "loading dictionary" chip. Once loaded, re-convert the existing text once.
- Use `performance.mark` around the conversion + render path and log the p50/p95 in the dev console. Include these numbers in the final report.

### Where the code lives

```
src/app/live/page.tsx               server wrapper, metadata, renders <LiveClient/>
src/app/live/LiveClient.tsx         "use client", recognition + tabs UI
src/lib/hinglish/normalize.ts       Unicode normalization and tokenization
src/lib/hinglish/lexicon.ts         loads and caches the JSON dictionary
src/lib/hinglish/rules.ts           the rules engine (schwa deletion + cleanup table)
src/lib/hinglish/index.ts           toHinglish(token) → { text, tier }
src/lib/hinglish/__tests__/         vitest suites
public/lexicon/hi-hinglish.v1.json  the generated dictionary
scripts/lexicon/                    one-time build scripts (section 2.5)
```

## 2.5 Rules engine (the part that is actually custom code)

This is the safety net for anything unpredictable, so it matters most. Write it once in TypeScript (`rules.ts`); the offline build script in 2.6 reuses the same module so the dictionary and the runtime fallback never disagree.

**Step A — Pre-processing on the Devanagari word**

1. Normalize to NFC and remove zero-width joiners and non-joiners.
2. Nukta handling: `ज़ → z`, `फ़ → f`; `क़ ख़ ग़ → k kh g` (drop the nukta); `ड़ → r`, `ढ़ → rh`.
3. **Schwa deletion** (the biggest quality lever). The inherent "a" of a consonant is dropped when it is word-final, and for medial consonants following the standard pattern vowel–consonant(a)–consonant–vowel, except in the first syllable. Implement it on syllable units before transliterating.

**Step B — Transliterate:** `Sanscript.t(word, "devanagari", "itrans")`.

**Step C — Ordered cleanup table** (apply top to bottom; each row is a regex replace on the lowercase string):

| Order | Rule | Examples |
|---|---|---|
| 1 | Lowercase everything | `Sh → sh` |
| 2 | `kSh` / `x` → `ksh`; `j~n` → `gy` | क्षमा → kshama, ज्ञान → gyan |
| 3 | `Ch` (छ) → `chh`; `ch` stays `ch` | छोटा → chhota |
| 4 | Retroflex capitals → plain: `T, Th, D, Dh, N` → `t, th, d, dh, n` | ठंडा → thanda |
| 5 | `sh`/`Sh` (श, ष) → `sh` | शाम → shaam |
| 6 | Vocalic `R^i` → `ri` | ऋषि → rishi |
| 7 | Anusvara / chandrabindu (`M`, `.N`, `~`): `n` before k, g, c, j, t, d, `m` before p, b, m, and `n` at word end | हैं → hain, मैं → main, दोस्तों → doston |
| 8 | Drop visarga and any leftover non-letter symbols | |
| 9 | Long vowels: `aa → a` in the middle or at the end of a word, but **keep `aa` at the start** | आप → aap, प्यार → pyar |
| 10 | `ii → i`, `uu → u` (also `ee → i` and `oo → u` mid-word only if the dictionary has no entry) | |
| 11 | Keep `ai`, `au`, `e`, `o` as is | है → hai, और → aur, नमस्ते → namaste |
| 12 | Collapse any run of 3 or more of the same letter to 2 | |

**Test targets** (Vitest, rules engine only, dictionary disabled). These are the goal; if a rule can't satisfy a case without breaking others, move that word to the override list (2.6) and document it in the test file.

| Hindi | Expected |
|---|---|
| कमल | kamal |
| समझ | samajh |
| सरकार | sarkar |
| नमस्ते | namaste |
| चलना | chalna |
| मित्र | mitra |
| दोस्त | dost |
| आप | aap |
| क्या | kya |
| ज़िंदगी | zindagi |
| ज्ञान | gyan |
| ऋषि | rishi |

Add at least 30 more cases from real transcripts once the first version works. Also test the edge cases: empty string, punctuation only, mixed Hindi and English in one sentence, numbers, very long tokens, repeated spaces.

## 2.6 Offline dictionary (one-time build, shipped as static JSON)

**Purpose:** map the top 20–50k most frequent Hindi words to their most common Hinglish spelling, so common speech is instant and consistent.

**Output:** `public/lexicon/hi-hinglish.v1.json`, a flat object `{ "है": "hai", "में": "mein", ... }`. Target size 1.5–4 MB raw (the host compresses it in transit). The version is in the filename so it can be cached forever; a new build gets a new filename.

**Build pipeline (`scripts/lexicon/`)**

1. `01_count_freq.py` — count Hindi token frequencies from a Hindi text corpus (for example Hindi Wikipedia, or AI4Bharat's IndicCorp, or CC-100 Hindi), keep the top N (default 50,000; make N a CLI argument). Normalize tokens with the same rules as `normalize.ts`.
2. `02_merge_attested.py` — attach real-world spellings. Use romanization datasets that list how people actually write Hindi words in Latin script (the Google Dakshina dataset's Hindi romanization lexicon, and the AI4Bharat Aksharantar Hindi pairs). **Verify each dataset's availability and license before using it, and record the sources in `scripts/lexicon/README.md`.** For each word, pick the spelling with the highest attestation count; break ties by shortest length; reject spellings with digits or odd characters; lowercase everything.
3. `03_fill_and_emit.ts` (run with `tsx`) — for words with no attested spelling, generate one with the **same TypeScript rules engine** from 2.5. Then apply the override files and write the JSON.
4. **Overrides (always win):**
   - `overrides.tsv`: a hand-written list of about 500 function words and very common words, for example है→hai, हैं→hain, मैं→main, में→mein, नहीं→nahi, क्या→kya, तो→toh, और→aur, का/की/के→ka/ki/ke, कि→ki, यह→yeh, वह→woh, बहुत→bahut, अच्छा→accha. The owner should review this file; Hinglish spelling is a matter of taste, so keep it easy to edit.
   - `loanwords.tsv`: English words that Chrome writes in Devanagari (कंप्यूटर→computer, स्कूल→school, मोबाइल→mobile, फोन→phone, वीडियो→video, इंटरनेट→internet). Add as many as you can verify.
5. Add both nukta and non-nukta key variants for words that have them.
6. Print a **build report**: entries count, file size, how many came from attested data, how many from rules, how many from overrides, and **coverage** of a held-out text sample (the percentage of tokens found in the dictionary). Report the measured number honestly; do not assume a target was met.

**Runtime loader (`lexicon.ts`)**

- `fetch("/lexicon/hi-hinglish.v1.json")` once, build a `Map`, cache it in module scope.
- Failures (offline, 404) must not break anything: log a warning, set a "dictionary unavailable" chip, and keep running on rules only.

## 2.7 Error handling ("no errors" requirement)

| Situation | What the user sees | What the code does |
|---|---|---|
| Unsupported browser | Card explaining "Use Chrome or Edge on desktop or Android" with the page's other features disabled | Detect after mount, never call recognition APIs |
| Mic permission denied | Message with steps to re-enable the mic for this site, plus a "Try again" button | Do not auto-restart |
| No mic found (`audio-capture`) | "No microphone found" message | Stop and show retry |
| `no-speech` | Quiet hint "I'm listening…" | Silently restart |
| `network` error | "Connection lost, reconnecting…" status chip | Restart with backoff, give up after 5 tries with a manual retry button |
| `aborted` / unexpected end | Brief "Reconnecting" chip | Restart unless the user pressed Stop |
| Dictionary load failure | Small "basic mode" chip | Rules-only mode |
| Any thrown error in the UI tree | Friendly fallback card with a Reload button | React error boundary around `LiveClient` |

Also: a single Stop must always stop everything (recognition, restart timers, audio meter stream), and leaving the page must clean up all of it.

## 2.8 Handling unpredictable speech (names and rare words)

The page will be shown to other people, so the speech cannot be predicted. The design for that:

- Common words come from the dictionary, so they are consistent.
- Everything else goes through the rules engine and is tinted amber (or red if suspicious), so nothing wrong looks confident.
- **Miss log (local only, optional but recommended):** record every word that fell back to the rules engine with a count, in memory and `localStorage`. Add a small "Export misses" button in the Words tab that downloads a JSON file. Rerunning the offline script with that file as an extra input is how the dictionary grows over time. No data ever leaves the browser.

## 2.9 Part 2 execution order

1. Install `react-speech-recognition`, `regenerator-runtime`, `@indic-transliteration/sanscript`, `vitest` (and types).
2. Build `normalize.ts`, `rules.ts` and the tests first. Get the test targets green before any UI.
3. Write the offline scripts, generate a first dictionary (a small N is fine to start), and wire `lexicon.ts` and `index.ts`.
4. Build `LiveClient.tsx` with the three tabs, controls, error states and auto-restart.
5. Make `/live` public in Clerk's middleware and confirm the page works while signed out.
6. Style with the Part 1 tokens, then verify in Chrome on desktop and on an Android phone.
7. Measure the conversion overhead (p50/p95) and confirm it is under 50 ms.
8. `npm run build`, `npm run lint` and `npx vitest run` must all pass.

---

# 3. Definition of Done

**Part 1**

- [ ] All existing routes work exactly as before (spot-check URL submit, upload, job results, export, library, OCR).
- [ ] Every page uses the tokens from 1.2, with body text at least 15px (captions at least 17px) and no oversized gaps.
- [ ] Light and dark themes both work; no neon colors; trust colors match the 0.75 / 0.50 backend thresholds.
- [ ] Mobile shows the bottom dock and bottom-sheet modals.
- [ ] Shell with sliding nav pill, ⌘K search, split-letter titles, magnetic buttons, counting stats, rings/gauges and toasts with Undo are present, and `prefers-reduced-motion` is respected.
- [ ] Looks right at 360, 768 and 1280 px.
- [ ] Build and lint pass.

**Part 2**

- [ ] `/live` works signed out, with the mic, in Chrome.
- [ ] Hindi speech appears as Hinglish while the user speaks; the Hindi tab shows the raw Devanagari; the Words tab shows tiers.
- [ ] Dictionary-hit words are green, rule words amber, suspicious words red.
- [ ] Stopping, silence, a network drop and denied permission were each tested manually and none crashed the page.
- [ ] No request to the FastAPI backend is made from `/live`.
- [ ] Vitest suites pass, including the test targets in 2.5.
- [ ] Final report includes: dictionary size and coverage, rules-engine test results, measured conversion latency, and a list of anything that could not be done.

## 4. Final report format (what you hand back)

1. What changed, grouped by Part 1 and Part 2, with file paths.
2. New dependencies and why each was needed.
3. Measured numbers (dictionary coverage, latency) and any limitations, stated plainly.
4. Anything you were unsure about and the choice you made.
