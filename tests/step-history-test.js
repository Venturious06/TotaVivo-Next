const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('apps/totavivo/life-companion.html', 'utf8');
const source = fs.readFileSync('apps/totavivo/assets/life-companion.js', 'utf8');

assert.match(html, /dismissStepsCard\(\)/, 'steps X has a dedicated hide action');
assert.match(html, /Hide steps card; counting stays active/, 'steps X explains that counting stays active');
assert.match(source, /function dismissStepsCard\(\)[\s\S]*dismissHomeCard\('home-steps-card'\)/, 'steps X only hides its card');
assert.doesNotMatch(source.match(/function dismissStepsCard\(\)[^\n]*/)[0], /stopMotion/, 'steps X does not stop motion');
assert.match(source, /slice\(-31\)/, 'daily history retains 31 days');
assert.match(source, /event_type:'steps_daily_total'/, 'completed days sync to the activity database');
assert.match(html, /sensor-steps-history/, 'recent daily totals have a visible history area');
assert.match(source, /addEventListener\('pagehide',saveSteps\)/, 'partial daily count saves when the app closes');

console.log('Step-card and 31-day history behavior passed');
