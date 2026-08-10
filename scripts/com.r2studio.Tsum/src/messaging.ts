// Utils for sending message
let _userPlan = -1;
let _lastSendingTime = 0;

/**
 * Whether a host API is actually present. Robotmon builds differ in what they
 * expose, so the callers guard on this before using an optional native.
 */
function checkFunction(f: unknown): boolean {
  return typeof(f) == 'function'
}
function checkCanSendMessage(): void {
  _userPlan = -1;
  if (getUserPlan !== undefined && checkFunction(sendNormalMessage)) {
    _userPlan = getUserPlan();
  }
  console.log('User Plan', _userPlan);
}
function canSendMessage(): boolean {
  if (_userPlan === -1) {
    return false;
  }
  const during = Date.now() - _lastSendingTime;
  return _userPlan >= 0 && during > 60 * 60 * 1000;
}
function sendMessage(topMsg: string, msg: string): void {
  if (canSendMessage()) {
    _lastSendingTime = Date.now();
    console.log(sendNormalMessage(topMsg, msg));
  }
}
checkCanSendMessage();

