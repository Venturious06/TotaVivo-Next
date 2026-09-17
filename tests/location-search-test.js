const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('apps/totavivo/life-companion.html', 'utf8');
const source = fs.readFileSync('apps/totavivo/assets/life-companion.js', 'utf8');

assert.match(html, /dismissLocationCard\(\)/, 'location X has a dedicated hide action');
assert.match(html, /Hide location card; GPS stays active/, 'location X explains that GPS stays active');
assert.match(source, /navigator\.geolocation\.watchPosition/, 'GPS uses continuing position updates');
assert.match(source, /dismissLocationCard[\s\S]*dismissHomeCard\('location-pref-card'\)/, 'location X only hides its card');
assert.match(source, /Live while TotaVivo is open/, 'GPS status states the web-app limitation');
assert.match(source, /Change My Name \/ User Name[\s\S]*showAboutTotaVivo/, 'user-name search stays inside TotaVivo');

console.log('Location and user-name search behavior passed');
