// The contract between the settings UI and the game script.
//
// These are two separate JavaScript worlds that never share memory: the UI
// serialises a settings object into a `start({...})` source string and hands it
// to `JavaScriptInterface.runScript`. Nothing at runtime checks that the object
// the UI builds is the object `start()` expects -- a renamed key is a silently
// ignored setting, not an error.
//
// This file is the one thing both compilations include (tsconfig.json and
// tsconfig.settings.json), so the two sides are checked against the same type.
// Emits nothing.

/**
 * Every playable skill, as the game's own internal ids.
 *
 * This one string travels the whole width of the project: the settings UI
 * offers it in the Skill Type dropdown, it crosses the `start({...})` bridge,
 * the skill files register handlers under it, and the play loop compares
 * against it. Nothing at runtime ties those four together -- a mismatch means
 * `SkillHandlers[skillType]` misses and the skill quietly falls back to
 * "randomize and wait", which plays but never performs the choreography.
 *
 * Declaring the set here makes all four checked against one list. The comment
 * on each is the label the dropdown shows.
 */
// A `const enum` so the ids are written once and referred to by name. It is
// erased at compile time and every use inlines to the string on the right, which
// is also what lets one vocabulary span both compilations: the settings WebView
// and the device script are separate JavaScript runtimes that share no memory,
// so a runtime constant object here would have to be duplicated into each. A
// compile-time-only one does not exist at runtime at all.
//
// The member name is the label the dropdown shows; the value is the game's id.
declare const enum SkillType {
  Burst = 'burst',
  BurstBubbles = 'burst_bubbles',
  Donald = 'block_donald_s',
  HolidayDonald = 'block_donaldx_s',
  JediLuke = 'block_lukej_s',
  Moana = 'block_moana_s',
  Marie = 'block_marie_s',
  MissBunny = 'block_missbunny_s',
  Rabbit = 'block_rabbit_s',
  HornHatMickey = 'block_mickeyh2015_s',
  SnowWhite = 'block_snowwhite_s',
  Cinderella = 'block_cinderella_s',
  SheriffWoody = 'block_woody2_s',
  CabbageMickey = 'block_cabbage_mickey_s',
  CptLightyear = 'block_cpt_ly_s',
  LightningMcQueenPlus = 'block_lightning_mcqueen_plus_s',
  TiaraMinniePlus = 'block_tiara_minnie_plus_s',
  PairTsum = 'block_pair_tsum',
  /** Offered in the dropdown; short-circuited in useSkill, so it has no handler. */
  NoSkill = 'no_skill',
  /** Not offered: what the Tsum constructor holds until start() reads the setting. */
  Unset = '',
}

/** The keys of record.txt that are not sender-portrait filenames. */
declare const enum RecordKey {
  HeartsCount = 'hearts_count',
}

/**
 * The configuration `start()` receives. The keys are exactly the `key:` entries
 * of the schema array in settings.ts; `langTaiwan` is the one addition, stamped
 * on by genStartCommand() from the stored locale rather than from a control.
 */
interface Settings {
  debugLogs: boolean;
  debugGame: boolean;
  jpVersion: boolean;
  specialScreenRatio: boolean;
  /** Not a schema entry -- genStartCommand() derives it from localStorage. */
  langTaiwan: boolean;
  autoLaunchApp: boolean;
  autobuyBoxes: number;
  autoPlayGame: boolean;
  clickAssist: boolean;
  pauseWhenCalc: boolean;
  clearBubbles: boolean;
  useFan: boolean;
  maxChainsPerScan: number;
  maxChain: number;
  prioritizeMyTsum: boolean;
  bonusScore: boolean;
  bonusCoin: boolean;
  bonusExp: boolean;
  bonusTime: boolean;
  bonusBubble: boolean;
  bonus5to4: boolean;
  bonusCombo: boolean;
  skillWaitingTime: number;
  skillLevel: number;
  skillType: SkillType;
  skillAutoTap: boolean;
  noSkillLastFeverSec: number;
  handleLongSkillAnimations: boolean;
  unlockLevelHoursWait: number;
  receiveAllHearts: boolean;
  receiveAllHeartsMinWait: number;
  receiveHeartsOneByOne: boolean;
  receiveHeartsSkipFirst: boolean;
  receiveHeartsSkipRuby: boolean;
  claimAllWithoutCoins: boolean;
  mailOpenMax: number;
  mailMinWait: number;
  recordSender: boolean;
  recordSenderEnlarge: boolean;
  sendHeartsAuto: boolean;
  sendHeartsToZeroScore: boolean;
  sendHeartsMaxRuntime: number;
  sendHeartsMinWait: number;
  tsumMonitorUrl: string;
  tsumAppRestartFrequency: number;
}
