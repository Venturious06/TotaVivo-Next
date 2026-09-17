const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('apps/totavivo/assets/life-companion.js', 'utf8');
function getFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end);
}
const panel = {innerHTML: ''};
let timers = 0;
const context = {
  document: {getElementById: () => panel},
  panic: {}, PANIC_CANCEL_SEC: 10,
  setInterval: () => { timers++; return 1; }, clearInterval: () => {},
  guardianContacts: () => [], guardianLocationLink: () => '',
  seniorName: 'Test', selectedPreRecord: 1,
  esc: x => x, speak: () => {}, fallCameraHtml: () => '', fallCameraRefresh: () => {}
};
vm.createContext(context);
for (const name of ['emergencyRecordAction', 'showPanicCountdown', 'showPanicHelp', 'renderFallHelpConsole']) {
  vm.runInContext(getFunction(name), context);
}
for (const name of ['showPanicCountdown', 'showPanicHelp', 'renderFallHelpConsole']) {
  context[name]();
  assert.match(panel.innerHTML, /recordNewMessage\(true\)/, name + ' offers recording');
  assert.match(panel.innerHTML, /Call 911|CALL 911/, name + ' retains emergency calling');
  assert.match(panel.innerHTML, /panicImSafe|cancelAlarm/, name + ' retains cancellation');
}
assert.equal(timers, 1, 'countdown remains active');
console.log('Emergency recording entry points passed');
