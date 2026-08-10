// Ambient declarations for the Robotmon runtime, the shared value shapes, and
// the parts of `Tsum` that are defined outside its constructor.
//
// This file emits nothing. It is the first entry in tsconfig.json's `files`, so
// everything declared here is visible to every other file in the bundle.
//
// ## Why `interface Tsum` lives here
//
// `Tsum` is a class in tsum.ts, but 87 of its methods are attached as
// `Tsum.prototype.NAME = function ...` across seven files, because the bundle
// has no modules and a class cannot be reopened. Declaring those methods in an
// interface of the same name merges them into the class type, which buys three
// things the plain prototype assignment cannot:
//
//   * `ts.foo()` and `this.foo()` are checked, completed and find-referenced
//     everywhere, instead of being `any`;
//   * each method's `this` and parameters are *contextually typed* from the
//     declaration below, so the assignment sites need no annotations at all;
//   * `Tsum.prototype.typo = ...` is an error, so a method can't be defined
//     under a name nothing calls.
//
// Adding a method therefore means adding its signature here as well. That is
// the cost of the arrangement, and the reason each one carries a real type
// rather than `any`.

// --- Shared geometry / colour value shapes ---

/** A screen coordinate in the script's logical 1080x1920 space. */
interface Point {
  x: number;
  y: number;
}

/** A BGRA colour sample as returned by the image/colour APIs. */
interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Anything carrying r/g/b channels: a `Color`, a `Coord`, a `PageColor`, or a
 * bare `{r, g, b}` literal. Used by the colour-comparison helpers, which are
 * fed entries from the heterogeneous Button/Page tables.
 *
 * The channels stay optional on purpose. Plenty of `Button`/`Page` entries are
 * bare coordinates with no recorded colour, and the helpers are handed those:
 * the missing channel makes the arithmetic NaN and the comparison false, so
 * "no colour recorded" reads as "no match". Requiring the channels here would
 * be a lie about the tables and would reject those calls.
 */
type ColorLike = { r?: number; g?: number; b?: number; a?: number };

/**
 * A tappable/checkable location. Position is always present; the colour
 * channels and the various per-entry extras (reference colours, sizes,
 * labels) are optional because the Button/Page tables are heterogeneous.
 */
interface Coord {
  x: number;
  y: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  w?: number;
  h?: number;
  z?: number;
  name?: string;
  color?: Color;
  color2?: Color;
}

/**
 * One friend's heart button in the ranking list, as located by doHeartSending.
 * Both colours are always carried: `color` is the "send" state, `color2` the
 * "already sent" one, and sendHeart needs each to tell them apart.
 */
interface HeartButton {
  x: number;
  y: number;
  color: Color;
  color2: Color;
}

/** One reference pixel used to fingerprint a page. */
interface PageColor {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  match: boolean;
  threshold: number;
}

/**
 * A recognisable game page: a colour fingerprint plus navigation anchors.
 *
 * `name` is a `PageName` (declared next to the `Page` table in data.ts, since
 * that table is what defines the vocabulary), not a bare string -- which is
 * what makes every `page === '...'` comparison a checked one.
 */
interface PageDef {
  name: PageName;
  colors: PageColor[];
  back: Coord;
  next: Coord;
  tsums?: Coord;
  store?: Coord;
  lockIcons?: Coord[];
  onDetect?: (this: Tsum) => void;
}

/**
 * An index-signature view of the `Page` table, for the `for (const key in Page)`
 * fingerprint loops. `Page` itself is inferred literally (see data.ts) so that
 * `Page.ClosePage.back` resolves to the entry; that inferred type deliberately
 * has no index signature, hence this cast target.
 */
type PageMap = { [name: string]: PageDef };

// --- Board / pathfinding shapes ---

/**
 * One tsum found by `findTsums`: position and radius in the play-square capture
 * space, plus the sampled colour. The image is HSV by the time it is sampled,
 * so b/g/r hold H/S/V.
 */
interface TsumPoint {
  x: number;
  y: number;
  z: number;
  b: number;
  g: number;
  r: number;
}

/** One colour cluster from `classifyTsums`: a running mean plus its members. */
interface TsumCluster {
  sumb: number;
  sumg: number;
  sumr: number;
  b: number;
  g: number;
  r: number;
  points: TsumPoint[];
}

/**
 * A board tsum as the pathfinder sees it: position shifted to the tsum's
 * top-left corner, tagged with the colour cluster it belongs to. `tsumIdx` is a
 * string because the board is built from a `for (... in ...)` over the clusters.
 */
interface BoardPoint {
  tsumIdx: string;
  x: number;
  y: number;
}

/**
 * A connectable chain of same-colour tsums, carrying an extra `tsumIdx` tag
 * identifying which colour cluster it belongs to (used to prioritise the
 * player's own tsum in 5>4 mode).
 */
interface TsumPath extends Array<BoardPoint> {
  tsumIdx?: number;
}

/** A game bubble located by `findGameBubbles`: centre plus radius. */
interface GameBubble {
  x: number;
  y: number;
  r: number;
}

// --- Native image handles ---

declare const NativeImageBrand: unique symbol;

/**
 * Opaque handle to a native (OpenCV) image. Every one of these must be handed
 * to `releaseImage`, which is why the type is nominal: it makes a raw number or
 * object impossible to pass where an image is expected.
 */
interface NativeImage {
  readonly [NativeImageBrand]: true;
}

// --- Records (the heart-sender history) ---

/** The running send/receive tallies, stored under `hearts_count`. */
interface HeartsCount {
  receivedCount: number;
  sentCount: number;
}

/** One recorded sender: how many hearts arrived on which day. */
interface SenderRecord {
  receiveCounts: { [dayTime: string]: number };
  lastReceiveTime: number;
  /** Added by genRecordTable() when rendering, not persisted. */
  all?: number;
  avg?: string | number;
  filename?: string;
}

/**
 * record.txt as parsed. `hearts_count` is the one fixed key; every other key is
 * a portrait filename mapping to a `SenderRecord`. The index signature stays
 * loose because the file is user data read straight from JSON, and tightening
 * it would only push casts to every read site.
 */
interface TsumRecord {
  /** Optional only because releaseRecord() resets the whole table to `{}`. */
  hearts_count?: HeartsCount;
  [filename: string]: any;
}

// --- Skills ---

/** How full the skill gauge reads: fired, nearly there, or plainly empty. */
declare const enum SkillReadiness {
  Active = 'active',
  Almost = 'almost',
  Far = 'far',
}

// --- Native dialogs (dialogs.ts) ---

/** Panel geometry, in both scan-image and device pixels. */
interface DialogBox {
  x0: number; y0: number; x1: number; y1: number;  // scan-image space
  dx0: number; dy0: number; dx1: number; dy1: number;  // device space
  scale: number;
  sw: number; sh: number;
}

/** Per-loop stall bookkeeping; see checkStall. */
interface StallGuard {
  where: string;
  /** The last page handled; `''` before the first round, which no page equals. */
  page: PageName | '';
  repeats: number;
  rounds: number;
  dialogTried: boolean;
  restarts: number;
}

// --- Click Assist (clickAssist.ts) ---

/** The touchscreen input device, as parsed out of `getevent -lp`. */
interface TouchDevice {
  path: string;
  xMax: number;
  yMax: number;
}

// --- Tiara Minnie+ (skills/tiaraMinniePlus.ts) ---

/** The capture pixel each grid cell reads from, flat and in row order. */
interface TiaraCells {
  px: number[];
  py: number[];
}

/** A sampled template reduced to just the cells it marks as present. */
interface TiaraTemplate {
  idx: number[];
  hx: number[];
  hy: number[];
  sat: number[];
  val: number[];
  n: number;
}

/** One present centre from one layout, with its precomputed cell table. */
interface TiaraCandidate {
  x: number;
  y: number;
  count: number;
  px: number[];
  py: number[];
}

/** The best-scoring candidate of a scan, and how far clear of its nearest rival. */
interface TiaraMatch {
  x: number;
  y: number;
  count: number;
  score: number;
  margin: number;
}

// --- Scheduling ---

/** A unit of work scheduled by the TaskController. */
interface Task {
  name: string;
  run: () => void;
  interval: number;
  runTimes: number;
  priority: number;
  lastRunTime: number;
  status: number;
}

// --- Static tuning constants ---

/** Static tuning constants for the player. */
interface TsumConfig {
  recordDir: string;
  tsumWidth: number;
  tsumBoundW: number;
  tsumBoundH: number;
  screenResize: number;
  gameContinueDelay: number;
  colors: number[][];
  maxChain: number;
  debugLogs: boolean;
}

// The `Settings` object `start()` receives lives in shared.d.ts, which is the
// one file both this compilation and the settings UI's include -- so the object
// the UI builds and the object the script reads are checked against one type.

// ---------------------------------------------------------------------------
// Tsum: the methods attached to the prototype outside tsum.ts's class body.
//
// Merged into `class Tsum`. Grouped by the file that implements each one.
// ---------------------------------------------------------------------------

interface Tsum {
  // --- tsum.ts ---------------------------------------------------------
  init(detect: boolean): void;
  sendMoneyInfo(): void;
  isAppOn(): boolean;
  startApp(): void;
  forceRestartApp(): boolean;
  screenshot(): NativeImage;
  playScreenshotSquare(): NativeImage;
  toResizeXY(x: number, y: number): Point;
  toResizeXYs(xy: Coord): Point;
  getColor(img: NativeImage, xy: Coord): Color;
  toRealXY(x: number, y: number): Point;
  toRealXYs(xy: Coord): Point;
  tap(xy: Coord, during?: number): void;
  tapDown(xy: Coord, during?: number): void;
  moveTo(xy: Coord, during?: number): void;
  tapUp(xy: Coord, during?: number): void;
  linkTsums(path: Point[]): void;
  popGameBubbles(): void;
  /** Returns whether a chain long enough to spawn bubbles was linked. */
  link(paths: TsumPath[], board?: BoardPoint[]): boolean;
  findPageObject(times?: number, timeout?: number): PageDef | null;
  /** The matched page's `name`, or `PageName.Unknown` when nothing fingerprinted. */
  findPage(times?: number, timeout?: number): PageName;
  matchesPage(pageName: PageName): boolean;
  exitUnknownPage(): void;
  goFriendPage(): void;
  checkGameItem(): void;
  goGamePlayingPage(): void;
  goTsumsPage(): void;
  /** Whether the store page opened and its buy button is live. */
  goTsumTsumStorePage(): boolean;
  clearAllBubbles(startDelay?: number, endDelay?: number, fromY?: number, delayBetweenLines?: number): void;
  /** Mean HSV of the MyTsum portrait, comparable with a `TsumCluster` centre. */
  sampleMyTsumColor(): Color;
  scanBoardQuick(): BoardPoint[];
  confirmGameOver(): boolean;
  taskPlayGameQuick(): void;
  taskReceiveAllItems(): void;
  fetchAllMails(): void;
  readRecord(): void;
  /** The matched portrait's filename, or `''` when the sender is new. */
  recognizeSender(img: NativeImage): string;
  countReceiveHeart(existFilename: string): void;
  saveRecord(): void;
  evictOldRecordImages(): void;
  releaseRecord(): void;
  clear(): void;
  skipAd(): void;
  taskReceiveOneItem(): void;
  friendPageGoToSelf(): void;
  /**
   * Whether the sweep finished. `undefined` means it stopped early because the
   * script is shutting down -- the caller's `while (!finished)` treats that the
   * same as "not finished".
   */
  doHeartSending(startTime: number): boolean | undefined;
  taskSendHearts(): void;
  taskAutoUnlockLevel(): void;
  taskAutoBuyBoxes(): void;
  taskRequestTsumMonitor(): void;
  requestTsumMonitor(force?: boolean): void;
  taskWatchdog(): void;
  taskTsumAppRestart(): void;
  sendHeart(btn: HeartButton): boolean;
  sleep(t?: number): void;
  isOnScreenshot(img: NativeImage, pageObject: Coord, colorDiff?: number): boolean;

  // --- skills/skillCore.ts ---------------------------------------------
  checkSkillReadiness(img: NativeImage, skillButton: Coord): SkillReadiness;
  fanWouldBeWasted(): boolean;
  maybeAutoTapSkill(board?: BoardPoint[]): void;
  useSkill(board?: BoardPoint[]): boolean;

  // --- dialogs.ts ------------------------------------------------------
  dialogScreenshot(sw: number, sh: number): NativeImage;
  findSystemDialog(): DialogBox | null;
  findDialogButton(box: DialogBox): Point | null;
  dumpUiXml(): string;
  tapDialogButtonViaUi(box: DialogBox): boolean;
  dialogChanged(box: DialogBox): boolean;
  tryDismissDialog(box: DialogBox, hint?: Coord): boolean;
  dismissSystemDialog(hint?: Coord): boolean;
  saveDebugScreenshot(tag: string): void;
  newStallGuard(where: string): StallGuard;
  checkStall(guard: StallGuard, page: PageName): void;

  // --- clickAssist.ts --------------------------------------------------
  findTouchDevice(): TouchDevice | null;
  /** The touch position in screen pixels, or null on timeout. */
  pollTouchDown(timeoutSec: number): Point | null;
  taskClickAssist(): void;

  // --- skills/cinderella.ts, skills/cptLy.ts ---------------------------
  useCinderellaSkill(): void;
  useCptLySkill(): void;

  // --- skills/tiaraMinniePlus.ts ---------------------------------------
  tiaraBoardSignature(): number[];
  tiaraWaitForSettledBoard(): boolean;
  tiaraCapture(): NativeImage;
  tiaraSample(img: NativeImage, cells: TiaraCells): number[];
  tiaraCloudCapture(): NativeImage;
  tiaraCloudFrac(img: NativeImage): number;
  tiaraScoreCandidate(img: NativeImage, cand: TiaraCandidate, tpl: TiaraTemplate): number;
  tiaraBestMatch(img: NativeImage, tpl: TiaraTemplate): TiaraMatch;
  /** The sampled bubble template, or null if no bubble appeared in time. */
  tiaraWaitForDream(timeoutMs: number): number[] | null;
  tiaraPick(tpl: TiaraTemplate): TiaraMatch | null;
  useTiaraMinniePlusSkill(): number;
}

/** The Android key events the script sends. Values are platform constants. */
declare const enum KeyCode {
  DpadDown = 'KEYCODE_DPAD_DOWN',
  DpadRight = 'KEYCODE_DPAD_RIGHT',
  Enter = 'KEYCODE_ENTER',
}

// --- Robotmon native runtime (provided by the host environment) ---
declare function sleep(ms: number): void;
declare function tap(x: number, y: number, during?: number): void;
declare function tapDown(x: number, y: number, during?: number): void;
declare function tapUp(x: number, y: number, during?: number): void;
declare function moveTo(x: number, y: number, during?: number): void;
declare function tapMove(id: number, x: number, y: number): void;
declare function press(key: string | number): void;
declare function keycode(code: KeyCode, during?: number): void;
declare function swipe(x1: number, y1: number, x2: number, y2: number, steps?: number): void;
declare function getColor(x: number, y: number): Color;
declare function getColors(points: Point[]): Color[];
declare function getScreenshot(): NativeImage;
declare function getScreenshotModify(
  x: number, y: number, w: number, h: number,
  outW: number, outH: number, quality: number): NativeImage;
declare function releaseImage(img: NativeImage): void;
declare function openImage(path: string): NativeImage;
declare function saveImage(img: NativeImage, path: string): void;
declare function cloneImage(img: NativeImage): NativeImage;
declare function clone(img: NativeImage): NativeImage;
declare function cropImage(img: NativeImage, x: number, y: number, w: number, h: number): NativeImage;
declare function getBase64FromImage(img: NativeImage): string;
declare function getImageColor(img: NativeImage, x: number, y: number): Color;
declare function getImageWidth(img: NativeImage): number;
declare function getImageHeight(img: NativeImage): number;
declare function getImageSize(img: NativeImage): { width: number; height: number };
declare function getScreenSize(): { width: number; height: number };
declare function getDeviceSize(): { width: number; height: number };
declare function getStoragePath(): string;
declare function getCurrentPackage(): string;
declare function launchApp(pkg: string): void;
declare function killCurrentPackage(): void;
declare function killApp(pkg: string): void;
declare function execute(cmd: string): string;
declare function readFile(path: string): string;
declare function writeFile(path: string, content: string): void;
declare function setScreenOrientation(orientation: number): void;
declare function keepScreenAwake(enabled?: boolean): void;

// --- Robotmon image-processing helpers (OpenCV-backed) ---
declare function smooth(img: NativeImage, type: number, size: number): void;
declare function convertColor(img: NativeImage, code: number): void;
declare function outRange(img: NativeImage, ...bounds: number[]): NativeImage;
declare function bgrToGray(img: NativeImage): NativeImage;
declare function houghCircles(
  img: NativeImage, method: number, dp: number, minDist: number,
  param1: number, param2: number, minRadius: number, maxRadius: number): GameBubble[];
declare function drawCircle(
  img: NativeImage, x: number, y: number, radius: number,
  r: number, g: number, b: number, thickness: number): void;
declare function getIdentityScore(img1: NativeImage, img2: NativeImage): number;

// --- Robotmon networking / account helpers ---
declare function httpClient(method: string, url: string, body: string, headers: object): string;
declare function getUserPlan(): number;
declare function sendNormalMessage(topMsg: string, msg: string): string;

// The settings WebView reaches `start`, `stop` and `genRecordTable` by name
// through `JavaScriptInterface.runScript(<source string>)`. They are declared
// -- not just implemented -- as plain global functions in index.ts, which is
// what keeps them reachable that way; nothing inside the bundle calls them, so
// there is no ambient declaration for them here.
