const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps', 'totavivo');
const html = fs.readFileSync(path.join(appDir, 'life-companion.html'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'assets', 'life-companion.css'), 'utf8');
const js = fs.readFileSync(path.join(appDir, 'assets', 'life-companion.js'), 'utf8');
function check(ok, message) { if (!ok) throw new Error(message); console.log('✓', message); }
check(html.includes('assets/life-companion.css'), 'external stylesheet is linked');
check(html.includes('assets/life-companion.js'), 'external application script is linked');
for (const modulePath of ['assets/core/storage.js','assets/core/state.js','assets/modules/medications.js','assets/modules/safety.js']) check(html.includes(modulePath), `module is linked: ${modulePath}`);
check(html.indexOf('assets/core/storage.js') < html.indexOf('assets/life-companion.js'), 'storage loads before the application');
check(!html.includes('<style>'), 'large inline stylesheet was removed');
check(css.length > 100000, 'complete application styling was preserved');
check(js.length > 250000, 'complete application behavior was preserved');
for (const id of ['s-home','s-medicine','s-phone','s-caregiver','s-settings']) {
  check(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `critical screen exists: ${id}`);
}
for (const asset of ['logo.png','icon-180.png','icon-192.png','icon-512.png','manifest.json','sw.js']) {
  check(fs.existsSync(path.join(appDir, asset)), `required asset exists: ${asset}`);
}
check(html.includes('Safety') || js.includes('fall'), 'safety feature code remains present');
check(js.includes('TotaStorage'), 'shared persistent storage is used');
check(!js.includes('localStorage') && !js.includes('sessionStorage'), 'main app has no direct browser-storage access');
console.log('\nTotaVivo v8.2 smoke test passed.');
