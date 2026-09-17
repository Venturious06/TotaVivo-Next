const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/totavivo/life-companion.html'),'utf8');
const css=fs.readFileSync(path.join(root,'apps/totavivo/assets/life-companion.css'),'utf8');
const js=fs.readFileSync(path.join(root,'apps/totavivo/assets/life-companion.js'),'utf8');

assert(html.includes("onclick=\"showAboutTotaVivo()\">ℹ️ About"),'About shortcut is visible');
assert(css.includes('.panic-hd .modal-x{position:relative;top:auto;right:auto'),'Guardian close button stays in its header');
assert(css.includes('.about-ov>.modal-x{top:max(12px'),'About close button respects the phone safe area');
assert(js.includes("v.localService?0:1000"),'on-phone voices rank before web voices');
assert(js.includes("' · On This Phone':' · Web Voice'"),'voice source is clearly labeled');
assert(js.includes("setInterval(function(){if(navigator.onLine)reg.update();},15*60*1000)"),'phone checks periodically for updates');
assert(js.includes("document.visibilityState==='visible'&&navigator.onLine"),'phone checks again when reopened');
assert(js.includes("worker.postMessage({type:'SKIP_WAITING'})"),'ready update activates automatically');
assert(css.includes('background-attachment:local'),'page fade remains attached to the visible scrolling screen');
assert(css.includes('linear-gradient(180deg,rgba(93,155,220,.10)'),'page uses the same top-to-bottom glossy treatment as controls');

console.log('Mobile controls, voices, and automatic update tests passed');
