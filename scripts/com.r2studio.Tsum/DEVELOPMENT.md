# Development Guide

Orientation for anyone touching the source. For what the script *does* and what
each setting means, see [README.md](README.md).

## Parity with TsumBeta
This is a temporary section until parity is confirmed.

This package is a TypeScript refactor of `com.r2studio.TsumBeta`
(`src/index.js`), and the two are meant to be runnable side by side so a
behaviour change can be attributed to the refactor rather than to a feature
difference. **Default settings on both sides should produce the same play.**

Comparison method (a throwaway Node script does all of it — the sources are
plain scripts with no imports, so each function body can be pulled out by name):
extract every `function NAME` and `Tsum.prototype.NAME` from both sides,
normalise away comments, whitespace, `var`/`let`/`const` and TS annotations,
and compare. Do the same for the `Page`/`Button`/`Config` tables by evaluating
the object literals and diffing flattened key paths, and for the `settings`
arrays keyed by `key`. As of the last pass: 82 functions normalise identically,
and everything below is the complete remainder.

> **Two notes for the extraction script.**
>
> 1. The `Tsum` constructor is now a `class Tsum { … constructor(…) { … } }`
>    rather than `function Tsum(…)`, so a pattern that only matches
>    `function NAME` will miss it. Every other method is still a
>    `Tsum.prototype.NAME = function` assignment and extracts as before.
> 2. Page names and skill ids are written as `PageName.GamePlaying` /
>    `SkillType.CptLightyear` here and as `'GamePlaying'` / `'block_cpt_ly_s'`
>    in Beta, so a textual comparison of the **TypeScript** sources now reports
>    ~60 spurious differences. Because these are `const enum`s they inline back
>    to the identical literal, so the fix is to run the extraction over the
>    **emitted** `build/index.js` instead of `src/*.ts` — at which point the two
>    sides are character-for-character comparable again. That is also how the
>    typing work was verified: parse both bundles and compare the ASTs, which
>    normalises away quote style and whitespace.

**Behaviourally identical, differing only in form** — safe to ignore when
chasing a discrepancy: `try`/`finally` guards around `releaseImage` (the leak
fixes; identical unless a native call throws), variable hoisting and renames,
constants lifted out of function bodies (`PlayAreaTopY`, `ShellBootClassPath`,
`SkillNotActiveColors`), and the skill dispatch table — `SkillHandlers` plus
`skillBareTapActivates()` replaces Beta's `if (skillType === 'burst' || ...)`
chains and resolves to the same skills.

The strict-typing pass added a few more form-only differences. Each was checked
by diffing the emitted, comment-stripped `build/index.js` against the previous
one, so they are known not to change behaviour:

| Change | Why it is behaviour-neutral |
|:--|:--|
| `log` / `debug` take rest parameters instead of reading `arguments` | Same values, same order. `debug` now builds its argument array before the `debugLogs` check rather than after — a few array writes on a path that already costs a `sleep(10)` downstream |
| `isSameColor` / `absColor` call a `channelDiff` helper | Literally `Math.abs(a - b)`, including the NaN a missing channel produces |
| `findPageObject`, `goTsumTsumStorePage`, `sendHeart` end with an explicit `return null` / `return false` | Only reachable once `isRunning` goes false. They previously fell through to `undefined`; every caller tests `!= null` or truthiness |
| `isOnScreenshot` wraps its `&&` chain in `!!(…)` | Returned the falsy operand before; every caller uses it in an `if` |
| `_uiDumpFailures` / `_lastDebugShot` initialised to `0` in the constructor | Both were read through `|| 0` guards, and `undefined >= 2` is `false` |
| `useCinderellaSkill(board)` → `useCinderellaSkill()` | The function never declared a parameter; the argument was discarded |
| `+a - +b` in a sort, `parseInt(String(x))`, `dayMapCount[+dayTime]` | Explicit forms of coercions JavaScript was already doing |

**Genuine differences that remain.** Each one is a confound for a side-by-side
run; check here first when the two diverge:

| Area | TsumBeta | Here |
|:--|:--|:--|
| Path search | greedy nearest-neighbour walk from every tsum, deduped (`calculateNearTsumPaths`) | connected components + bounded-DFS longest path (`buildTsumNeighbors`/`findTsumComponents`/`findLongestTsumPath`) |
| Unknown screen | blind `DPAD_DOWN`+`ENTER` | tries `dismissSystemDialog()` first (structural native-dialog handling) |
| `RootDetection*` pages | each entry keeps its own `name`, so `findPage()` returns e.g. `RootDetectionNox480x800x160dpiEn` | every entry is named `RootDetection`, which the navigation loops branch on; one extra fingerprint (`RootDetection1080pEn`). The whole rest of the `Page` and `Button` tables is value-identical |
| Navigation loops | loop until the target page is reached | stall guards that escalate to a dialog check, then an app restart (`newStallGuard`/`checkStall`) |
| Sender portraits | every recorded portrait held in memory | most recent `maxRecordImages` (200) only |
| App restart on stall | n/a | `forceRestartApp()`, gated on "Auto launch app" |
| Overload taps | n/a | blind skill taps in `link()` for bare-tap skills |
| MyTsum | n/a | colour sampled per game, drives "Link MyTsum first" |
| Extra settings | n/a | `clickAssist`, `maxChainsPerScan`, `prioritizeMyTsum` — all default to Beta's behaviour (off, 6 = Beta's hard-coded `splice(0, 6)`, off) |
| Extra tasks | n/a | `taskClickAssist`, `taskWatchdog` |

Two things are deliberately held identical **because** they are tempting to
tune independently, and tuning one alone invalidates every comparison: the
drag timings in `linkTsums` (10/10/10 ms), and the `taskTsumAppRestart` body,
which is inlined rather than calling `forceRestartApp()` for that reason.

## The one thing to understand first

**There are no imports and no modules.** Every `.ts` file under `src/` is
concatenated, in the order listed in `tsconfig.json`, into a single
`build/index.js` that Robotmon loads and runs. All files therefore share one
global scope: a `function` or `var` declared in `data.ts` is simply visible in
`tsum.ts`, with no import statement anywhere.

Two consequences worth internalising:

- **Order in `tsconfig.json` matters.** Anything that *executes at load time*
  (top-level assignments like `var SkillHandlers = {}`, or the `registerSkill`
  calls in the skill files) must be listed after what it depends on. Function
  declarations hoist across the whole bundle, so *calls made at runtime* are
  order-independent — only load-time work is sensitive.
- **Name collisions are silent.** Two files declaring the same symbol will not
  error; the later one just wins. This has bitten the project before: a bad
  merge restored an old monolithic `index.ts` alongside the split files, and
  because `index.ts` is concatenated last, its duplicate definitions silently
  overwrote everything else.

## The second thing: how `Tsum` is typed

`Tsum` is a `class` in `tsum.ts`, but **87 of its methods are attached from
outside the class body** as `Tsum.prototype.NAME = function ...`, spread over
seven files. That is forced by the point above: with no modules, a class cannot
be reopened, and splitting the object across files is the whole reason the
package is not one 4,000-line file.

The two halves are joined by **declaration merging**: `interface Tsum` in
`globals.d.ts` declares every one of those methods, and TypeScript merges the
interface into the class of the same name. What that buys:

- `ts.foo()` and `this.foo()` are checked, completed and find-referenced across
  the whole bundle. Before this, `ts` was `any` and none of that worked.
- Inside each `Tsum.prototype.NAME = function (...)`, **`this` and the
  parameters are contextually typed from the interface** — which is why those
  87 assignments carry no annotations of their own and should not grow any.
- `Tsum.prototype.typo = ...` is an error, so a method cannot be defined under a
  name that nothing calls.

**Adding a method to `Tsum` therefore means adding its signature to
`interface Tsum` as well.** That is the one piece of bookkeeping the arrangement
costs, and the compiler tells you immediately when you forget it.

The same idea, one level down, is why `Button`, `Page` and `Logs` in `data.ts` /
`logs.ts` carry **no type annotation**: an annotation like `{[k: string]: any}`
erases the key set, and with it `Button.gameSkill1`'s go-to-definition and any
chance of catching `Button.gameSkil1`. Inferring the object literal keeps both.
`Page` uses `satisfies PageMap` so each entry is still validated against
`PageDef` without losing its keys, and the loops that walk the table by string
key cast to `PageMap` for an index signature.

## The third thing: the string vocabularies are `const enum`s

Object keys are only half the story. Several *values* are passed around as bare
strings and are what most of the branching actually tests. Each set is a
`const enum`, and the code refers to members rather than writing the string:

| Enum | Declared in | Ties together |
|:--|:--|:--|
| `PageName` | `data.ts`, directly above the `Page` table | `PageDef.name`, `findPage()`'s return, `matchesPage()`, `checkStall()`, and the ~33 `page === PageName.X` comparisons |
| `SkillType` | `shared.d.ts` (both compilations need it) | the Skill Type dropdown in `settings.ts`, `Settings.skillType`, `ts.skillType`, every `registerSkill({types: [...]})`, and the play-loop comparisons |
| `SkillReadiness` | `globals.d.ts` | `checkSkillReadiness()`'s return and its three callers |
| `KeyCode` | `globals.d.ts` | the `keycode()` host call |
| `RecordKey` | `shared.d.ts` | the one non-filename key of record.txt, read on both sides |

**Why `const enum` and not a `const` object.** A const enum is erased at compile
time: `page === PageName.GamePlaying` emits `page === "GamePlaying"`, so this
costs nothing at runtime -- no object, no property read -- while giving each
name one definition to jump to, find references on, and rename. It is also the
only kind of shared constant that *can* span the two compilations: the settings
WebView and the device script are separate JavaScript runtimes that share no
memory, so a runtime object in `shared.d.ts` would have to be duplicated into
each bundle. A compile-time-only one does not exist at runtime at all.

**What this does and does not prevent.** A misspelt name is an error everywhere:
on the enum (`Property 'GamePlayng' does not exist ... Did you mean
'GamePlaying'?`), in a `Page` entry, and in a comparison against a raw string
(`types 'PageName' and '"GamePlayng"' have no overlap`). What it does *not* do
is forbid a **correctly spelled** raw string -- TypeScript deliberately allows
comparing a string enum against a literal of the same value, so
`page === 'GamePlaying'` still compiles. The enum makes wrong strings
impossible, not raw strings. Banning the raw form outright would be a lint rule
(`no-restricted-syntax`), not a type.

Adding a page or a skill means adding a member; the compiler says so
immediately, and `Did you mean ...?` usually names the fix.

Several `PageName`s map to more than one `Page` entry -- alternative colour
fingerprints for the same screen (regional, emulator and dpi variants).
`RootDetection` has eight. That is why the enum is written by hand rather than
derived from the table's keys: the keys are fingerprints, the names are screens.

`PageName.Unknown` and `SkillType.Unset` are the two members with nothing behind
them: the first is what `findPage()` reports when nothing fingerprinted, the
second is what the `Tsum` constructor holds until `start()` reads the setting.

> **If the build ever moves off `tsc`** (see [Building](#building)): ambient
> const enums declared in a `.d.ts` are the one construct a transpile-only
> bundler such as esbuild cannot inline, because it never reads the `.d.ts`.
> `PageName` lives in a `.ts` file and is fine; `SkillType`, `RecordKey`,
> `SkillReadiness` and `KeyCode` would need moving into a `.ts` file (or
> becoming `as const` objects) as part of that migration.

## How it runs on a device

```
Robotmon loads the script folder
        │
        ├── index.html ──► settings.js   (the settings UI, a WebView page)
        │                      │
        │                      │  user taps ▶ Play
        │                      │  onEvent('OnPlayClick') builds a settings object
        │                      │  and calls JavaScriptInterface.runScript(...)
        │                      ▼
        │              start({ jpVersion: false, skillType: 'burst', ... })
        │
        └── index.js ──────► start() in index.ts
                                 │
                                 ├─ new Tsum(...)              the game-playing object
                                 ├─ new TsumTaskController()   the scheduler
                                 ├─ gTaskController.newTask(...) × N
                                 └─ gTaskController.start()    ──► blocking loop
```

The settings UI and the game script are **two separate JavaScript worlds**. They
never share memory; the only channel between them is
`JavaScriptInterface.runScript(<source string>)`. That is why `start()` receives
its whole configuration as one JSON-serialised argument rather than reading it
from anywhere.

Once `gTaskController.start()` is called, `loop()` runs until stopped: on each
tick it picks the highest-priority task that is due and runs it to completion.
Tasks are cooperative — a long one like `taskPlayGameQuick` blocks the loop for
the whole game, so nothing else runs meanwhile.

Tapping ⏸ Pause calls `stop()`, which clears `ts.isRunning` and drains the
controller. Because tasks are cooperative, that takes effect at the next task
boundary — a game already in progress plays on until its loop notices.

## File map

Listed in bundle order. Skills are covered in
[the skills section](#skills--srcskills) below.

| File | What lives in it |
|:--|:--|
| `shared.d.ts` | Types only, emits nothing. The `Settings` interface plus the `SkillType` and `RecordKey` const enums — what is carried across the `start({...})` string bridge. **The one file both `tsconfig.json` and `tsconfig.settings.json` compile**, so the object the UI builds and the object the script reads are checked against the same type; a renamed setting key or an unregistered skill id now fails the build instead of silently becoming something nobody reads. |
| `globals.d.ts` | Types only, emits nothing. Ambient declarations for the Robotmon host API (`tap`, `getScreenshot`, `execute`, `readFile`, the OpenCV helpers), the shared value shapes (`Point`, `Color`, `PageDef`, `Task`, `TsumPath`, `BoardPoint`, `NativeImage`, …), and **`interface Tsum`, the 87 prototype methods** (see [above](#the-second-thing-how-tsum-is-typed)). Add a declaration here when the compiler cannot find a host function, and add a signature here whenever you add a `Tsum.prototype` method. |
| `settings.d.ts` | Types only, emits nothing, and **only in the settings compilation**. The WebView's own globals — `JavaScriptInterface`, jQuery — plus `SettingSpec`, the shape of one schema row. None of the device API exists in that world. |
| `taskController.ts` | `TsumTaskController` — the cooperative scheduler. `newTask(name, fn, interval, runTimes)` registers work; `loop()` repeatedly runs the highest-priority *due* task. Ties break toward the longer interval, then the least-recently-run. Also holds the `errorCount` guard. |
| `state.ts` | The two script-wide globals `ts` (the live `Tsum`) and `gTaskController`. |
| `utils.ts` | Four small helpers used everywhere: `isSameColor` / `absColor` (colour comparison, the backbone of all detection), `nowTime`, and `log` / `debug`. `log` prefixes every line with the running heart counters and is throttled by a 10 ms sleep. |
| `data.ts` | **All tuning constants and coordinates — no logic.** `Config` (tsum width, resize sizes, debug flag), `Button` (~70 named screen coordinates, at a nominal 1080×1920), `Page` (colour fingerprints for every screen the script recognises) and the `PageName` const enum above it, `TiaraLayouts` / `TiaraMinnieConfig`, and `GameBubbleConfig`. Most "the script taps the wrong spot" fixes are edits to this file alone. |
| `logs.ts` | `Logs` (English) and `LogsTW` (Traditional Chinese) — the user-visible message strings. `start()` picks one based on the language setting and hands it to the `Tsum` constructor, which stores it as `ts.logs`. |
| `messaging.ts` | Push-notification plumbing for the paid-plan integration: `checkCanSendMessage` / `canSendMessage` / `sendMessage`, rate-limited to one message per hour. Also `checkFunction`, used to feature-detect host APIs that may not exist on every Robotmon build. |
| `pathfinding.ts` | Board detection and chain planning, no tapping. `findTsums` and `findGameBubbles` locate circles via a grayscale Hough pass (grayscale deliberately, so no colour is filtered out before detection), `classifyTsums` then samples colour from an HSV copy and clusters it; `buildTsumNeighbors` / `findTsumComponents` / `findLongestTsumPath` build and search the connectivity graph, and `calculatePaths` ranks the results. `findChainAtTouch` is the Click Assist entry point. |
| `tsum.ts` | The `Tsum` object — the bulk of the script. Constructor and `init` (screen geometry, resolution detection), the low-level I/O wrappers (`screenshot`, `tap`, `linkTsums`, the coordinate-space converters), page navigation (`findPage`, `matchesPage`, `goFriendPage`, `goGamePlayingPage`, …), and the long-running **tasks**: `taskPlayGameQuick`, `taskReceiveOneItem`, `taskSendHearts`, `taskAutoUnlockLevel`, `taskAutoBuyBoxes`, `taskWatchdog`. Also the sender-portrait record keeping. |
| `skills/` | One file per skill plus the dispatcher — see [below](#skills--srcskills). |
| `clickAssist.ts` | The Click Assist mode: instead of playing on its own, the script reads the raw Linux touch event stream (`getevent` via `execute`) and draws the chain wherever the user taps. `findTouchDevice`, `pollTouchDown`, `taskClickAssist`. Mutually exclusive with auto-play. |
| `dialogs.ts` | Android *system* dialogs (root-detection warnings, permission prompts) — the ones that are not part of the game and can appear over it. Detects a dialog by its panel colours, finds its buttons, and falls back to parsing `uiautomator` XML when the colour pass is ambiguous. Also the `newStallGuard` / `checkStall` progress watchdog. |
| `index.ts` | The entry point, and *only* that: `start(settings)` maps every setting onto the `Tsum` instance and registers the task set, `stop()` tears it down, and `genRecordTable()` renders the heart-log HTML report. Keep it thin — this file being fat is what caused the merge accident described above. |
| `settings.ts` | **Compiled separately** (`tsconfig.settings.json` → `build/settings.js`); not part of the game bundle. The settings UI: the `settings` array declaring every option, the jQuery rendering, localStorage persistence, and `genStartCommand` which serialises the form into the `start({...})` call. Adding a setting means editing here *and* reading it in `index.ts`. |

Non-TypeScript files: `index.html` (the settings page shell, inlined at build
time), `index.css`, `build.sh` / `build.ps1`, `deploy.ps1`.

## Skills — `src/skills/`

`skillCore.ts` owns everything common to every skill: the gauge read
(`checkSkillReadiness`), the fever hold-off, the activation tap(s), and the
`useSkill` dispatcher. Each remaining file is one skill, registering a handler:

```ts
registerSkill({
  types: ['block_moana_s'],        // skillType values from the settings dropdown
  afterActivate: function(ts) {    // the choreography, after the button is tapped
    ts.clearAllBubbles(2500, 50);
  }
});
```

Handlers may also declare `beforeActivate` (work that must land *before* the
skill fires, e.g. waiting for the board to settle), `usesSecondButton` (Pair
Tsum's two halves) and `bareTapActivates` (burst skills, where a tap is the whole
activation — this is what lets the play loop fire them blind between chains).
Returning `false` from `afterActivate` reports "did not fire" to the caller.

Every skill file is a **leaf**: nothing outside `src/skills/` references its
symbols, and it is reached only through `SkillHandlers[skillType]` at runtime.
An unregistered `skillType` falls back to `skillRandomizeAndWait`; `no_skill`
short-circuits before dispatch.

**To add a skill:** create `src/skills/<name>.ts` with a `registerSkill` call,
add it to the `files` list in `tsconfig.json` (after `skillCore.ts`), and add the
matching dropdown entry in `settings.ts`.

## How the layers fit together

```
  index.ts            start() / stop()          entry point
      │
      ▼
  taskController.ts   schedules ──────────────► tsum.ts  task* methods
                                                   │
                        ┌──────────────────────────┼──────────────────────┐
                        ▼                          ▼                      ▼
                  pathfinding.ts             skills/                 dialogs.ts
                  what to link          which skill, how          system popups
                        │                          │                      │
                        └──────────────┬───────────┘──────────────────────┘
                                       ▼
                              data.ts  ·  logs.ts  ·  utils.ts
                          coordinates   strings    colour maths
                                       │
                                       ▼
                              Robotmon host API
                        (declared in globals.d.ts)
```

Dependencies point downward. `data.ts`, `logs.ts` and `utils.ts` are leaves that
know nothing about the rest; `tsum.ts` is the hub that everything above the
middle row goes through.

The couplings that are easy to miss:

- **`tsum.ts` → `skills/`** is not just `useSkill`. `link()` calls
  `skillBareTapActivates` to decide whether to fire blind after each chain, and
  the play loop calls `fanWouldBeWasted` and `maybeAutoTapSkill`. All four live
  in `skillCore.ts`, which is why it stays in the main bundle rather than being
  a leaf like the individual skills.
- **`data.ts` owns Tiara's tables, `skills/tiaraMinniePlus.ts` owns its logic.**
  Same for `logs.ts` and the Tiara log strings. Data and behaviour are split
  deliberately: tuning a threshold should not mean opening the skill file.
- **`settings.ts` ↔ `index.ts`** is a string contract. A setting key typed in one
  place and not the other fails silently at runtime, not at compile time.

## Building

```bash
npm run typecheck      # both compilations: the game bundle and the settings UI
npm run build          # → dist/index.js, dist/index.html, index.zip
npm run buildAndAdb    # build, then adb push to the device
npm run adb            # push an existing dist/ without rebuilding
```

`build.ps1` is the PowerShell equivalent of `build.sh`. `typecheck:game` and
`typecheck:settings` run the two halves separately.

**The game bundle is `strict: true` and clean.** Keep it that way — the point of
the strictness is that `ts.*`, `this.*`, `Button.*`, `Page.*`, `settings.*` and
the log tables are all checked names rather than `any`, which is what makes a
typo a build error instead of a silent no-op on the device. The settings UI is
checked at a lower setting (`noImplicitThis` + `strictNullChecks`, no
`noImplicitAny`): it is a direct port of the original `settings.js` and still
leans on implicit `any` in its jQuery rendering, but it does check the thing
that matters — that the object `genStartCommand` builds matches `Settings`.

**TypeScript is pinned to 6.x, deliberately.** TypeScript 7 removed `target:
ES5`, `outFile` and `module: none` — and this project needs all three: the
Robotmon runtime is [ES5-only](../../README.md), and the whole no-imports design
depends on `outFile` concatenation. The `"ignoreDeprecations": "6.0"` line in
both tsconfigs is what keeps those options legal. Moving to TS 7 would mean
replacing both the bundler and the downleveller (e.g. esbuild for bundle + ES5,
with tsc reduced to type checking) — a build-system migration, not a config edit.

## Where to start

| Task | Look at |
|:--|:--|
| Script taps the wrong place | `data.ts` → `Button` |
| Script does not recognise a screen | `data.ts` → `Page`, then `Tsum.matchesPage` in `tsum.ts` |
| Chains are poor / short | `pathfinding.ts` → `calculatePaths`, `findLongestTsumPath` |
| A skill misfires | `src/skills/<name>.ts`, then `useSkill` in `skillCore.ts` |
| Add a new skill | `src/skills/`, `tsconfig.json`, `settings.ts` dropdown |
| Add a setting | `settings.ts` (`settings` array) **and** `index.ts` (`start`) |
| Add a background job | `index.ts` → `gTaskController.newTask`, task body in `tsum.ts` |
| Script gets stuck on a popup | `dialogs.ts` |
| Wrong/missing log text | `logs.ts` (both `Logs` and `LogsTW`) |

## Known latent bug

`taskAutoBuyBoxes` re-reads the page twice *inside* its `if (page != null)`
block (`page = this.findPageObject(1, 200)`) and dereferences the result without
re-checking. `findPageObject` returns null whenever nothing is recognised inside
its 200 ms budget, so both spots — and the `this.tap(page.next)` that follows —
can throw a `TypeError`. The task controller swallows task exceptions and counts
them towards its restart threshold, which is why this shows up as autobuy
quietly stopping rather than as a visible crash.

Left as-is deliberately: adding a guard changes behaviour, and this package is
being held behaviourally identical to TsumBeta. The two spots are marked with
`!` and a `LATENT:` comment in `tsum.ts` so they are easy to find when someone
decides to fix them. The fix is presumably to `break` out of the loop when the
re-read comes back null.

## Debugging

- `Config.debugLogs` (the "Debug logs" setting) enables `debug()` output.
- `ts.debug` (the "Debug game" setting) additionally saves annotated screenshots
  to `<storage>/tmp/`.
- `adb logcat | grep Robotmon:` shows script output on the host.
- Detector thresholds are best tuned offline against saved screenshots on the
  PC (turn on "Debug game" to collect them) rather than by trial and error on
  the device.
