// The two script-wide globals. Declared here rather than in globals.d.ts
// because they are real `var`s in the bundle, not ambient declarations.
//
// Both are `undefined` before start() and again after stop() clears them, which
// is why the type says so: log() runs on both sides of that window and already
// guards, and the guards are now checked rather than merely conventional.
var ts: Tsum | undefined;
var gTaskController: TsumTaskController | undefined;
