// Utils

/**
 * Per-channel distance. A missing channel yields NaN, which is deliberate and
 * relied upon by both callers below -- see the note on `ColorLike`. The `!`s
 * say "undefined is possible here and NaN is the intended result", not "this
 * can never be undefined".
 */
function channelDiff(a: number | undefined, b: number | undefined): number {
  return Math.abs(a! - b!);
}

function isSameColor(c1: ColorLike, c2: ColorLike, diff?: number): boolean {
  if (diff === undefined) {
    diff = 20;
  }
  return channelDiff(c1.r, c2.r) <= diff
      && channelDiff(c1.g, c2.g) <= diff
      && channelDiff(c1.b, c2.b) <= diff;
}

function absColor(c1: ColorLike, c2: ColorLike): number {
  return channelDiff(c1.r, c2.r) + channelDiff(c1.g, c2.g) + channelDiff(c1.b, c2.b);
}

function nowTime(): number {
  const offset = (new Date().getTimezoneOffset()) * 60 * 1000;
  return Date.now() + offset;
}

/**
 * A message part: anything printable. A function is a thunk that is only called
 * -- and so only pays for whatever it computes -- when debug logs are on.
 */
type LogPart = any;

function debug(...parts: LogPart[]): void {
  if (Config.debugLogs) {
    const newArgs: LogPart[] = ['*DEBUG*'];
    log.apply(null, newArgs.concat(parts));
  }
}

function log(...parts: LogPart[]): void {
  sleep(10);
  const args: LogPart[] = [];
  if (ts !== undefined && ts.showHeartLog && ts.record && ts.record[RecordKey.HeartsCount]) {
    let msg = "";
    msg += "R:"+ts.record[RecordKey.HeartsCount]!.receivedCount+" ";
    msg += "S:"+ts.record[RecordKey.HeartsCount]!.sentCount;
    if (gTaskController !== undefined && gTaskController.tasks !== undefined) {
      const sendTask = gTaskController.tasks["sendHearts"];
      if (sendTask !== undefined) {
        if (sendTask.lastRunTime === 0) {
          msg += "/0";
        } else {
          const next = (nowTime() - (sendTask.lastRunTime + sendTask.interval)) / 60000;
          msg += "/" + (+next.toFixed(0));
        }
      }
    }
    args.push("["+msg+"]");
  }
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    if (typeof part == 'object') {
      part = JSON.stringify(part, null, 2);
    } else if (typeof part == 'function') {
      if (Config.debugLogs)
        part = part();
      else
        part = "";
    }
    args.push(part);
  }
  console.log.apply(console, args);
}

