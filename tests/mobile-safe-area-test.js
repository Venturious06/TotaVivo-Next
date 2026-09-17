const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/totavivo/life-companion.html'),'utf8');
const css=fs.readFileSync(path.join(root,'apps/totavivo/assets/life-companion.css'),'utf8');

assert(html.includes('class="tota-group-link"'),'Tota Group link uses the responsive class');
assert(!html.includes('position:fixed;left:8px;bottom:8px'),'old overlapping inline position is removed');
assert(css.includes('padding-top:max(44px,env(safe-area-inset-top))'),'phone status area is reserved');
assert(css.includes('bottom:calc(76px + env(safe-area-inset-bottom))'),'Tota Group link clears bottom navigation');
assert(css.includes('right:max(8px,env(safe-area-inset-right))'),'Tota Group link respects the phone edge');

console.log('Mobile safe-area tests passed');
