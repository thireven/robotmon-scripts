// Ambient declarations for the settings UI only (settings.ts).
//
// settings.ts runs inside Robotmon's settings WebView, not on the device
// script side, so it sees a completely different set of globals: jQuery from
// index.html and the `JavaScriptInterface` bridge. None of the Robotmon device
// API in globals.d.ts exists here -- reaching it means sending a source string
// through `JavaScriptInterface.runScript`.
//
// Emits nothing. Included only by tsconfig.settings.json.

/**
 * The bridge into the device script. Everything crossing it is JavaScript
 * source as a string, evaluated in the game script's global scope -- which is
 * why `start`, `stop` and `genRecordTable` have to stay global functions there.
 */
declare const JavaScriptInterface: {
  /** Evaluate `script` in the device script's scope, discarding the result. */
  runScript(script: string): void;
  /** As runScript, but pass the result to the global function named `callbackName`. */
  runScriptCallback(script: string, callbackName: string): void;
  showMenu(): void;
  hideMenu(): void;
};

// jQuery, loaded by index.html. Typed loosely on purpose: pulling in @types
// /jquery would be the only dependency in the project and this file uses a
// handful of its methods.
declare const $: any;
declare const jQuery: any;

/** One row of the settings schema (the `settings` array in settings.ts). */
interface SettingSpec {
  key?: string;
  title?: string;
  title_zh_TW?: string;
  default?: boolean | number | string;
  dev_mode?: boolean;
  /** Present on dropdown settings: the selectable options. */
  dropdown?: SettingSpec[];
  options?: SettingSpec[];
  buttons?: { title: string; onclick: string }[];
  min?: number;
  max?: number;
  step?: number;
  incrementBy1?: boolean;
}
