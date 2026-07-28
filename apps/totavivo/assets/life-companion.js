/* TotaVivo Life Companion v8.2 — extracted from the validated v7.3.29 build. */
// ═══ GLOBALS ═══
// ── App version ── bump this one constant on each release. Format: major.minor for
//   feature releases (7.3, 7.4…), add a third number for small updates (7.3.1, 7.3.2…).
var APP_VERSION='8.2.0';
var slowTap=true,curContact='Susan',lastAction=null,undoTimer=null;
var SENIOR_NAME_KEY='totavivo_senior_name';
var seniorName='Dorothy';
function loadSeniorName(){try{var s=TotaStorage.getItem(SENIOR_NAME_KEY);if(s)seniorName=s;}catch(e){}}
function saveSeniorName(n){seniorName=n;try{TotaStorage.setItem(SENIOR_NAME_KEY,n);}catch(e){}applySeniorName();}
function applySeniorName(){
  document.querySelectorAll('.user-name-display').forEach(el=>el.textContent=seniorName);
  // Never pre-fill the placeholder persona name into the "what should Vivo call you?" box —
  // it made it far too easy to tap Continue and accidentally stay "Dorothy" forever.
  var inp=document.getElementById('about-name-input');if(inp)inp.value=(seniorName==='Dorothy'?'':seniorName);
  // If the name changed mid-session, re-personalize the demo emails (they bake the name in
  // when the array is built at load) and re-render if the email screen is up.
  var prev=applySeniorName._last||'Dorothy';
  if(prev!==seniorName&&typeof emailsData!=='undefined'){
    emailsData.forEach(function(e){['fullText','preview','subject','aiSummary'].forEach(function(k){
      if(e[k]&&e[k].indexOf(prev)!==-1)e[k]=e[k].split(prev).join(seniorName);
    });});
    if(typeof renderEmails==='function'&&typeof filteredEmails!=='undefined')try{renderEmails(filteredEmails);}catch(_){}
  }
  applySeniorName._last=seniorName;
  // Refer-a-friend code is derived from the user's own name (not the "DOROTHY26" placeholder).
  var rc=document.getElementById('referral-code-display');if(rc)rc.textContent=referralCode();
  // Keep the synced household's copy of the name current too — it doubles as the cloud
  // backup that restores the name if the phone's browser storage ever gets cleared.
  if(typeof syncClient!=='undefined'&&syncClient&&typeof syncState!=='undefined'&&syncState.linked&&syncState.role==='senior'){
    try{syncClient.from('households').update({senior_name:seniorName}).eq('id',syncState.householdId).then(function(){});}catch(_){}
  }
}
// ── ACCOUNT NUMBER ──
// A stable 9-digit number generated once per user and kept forever. It's what makes the
// referral code genuinely unique-ish: two people who share a first name still get different
// codes because their account numbers differ. Shown in the About modal so "last 3 of your
// account number" is something the user can actually see. (If this device later links sync,
// this number stays as-is so the referral code never changes on them.)
var ACCOUNT_ID_KEY='totavivo_account_id';
function getAccountNumber(){
  var a=null;
  try{a=TotaStorage.getItem(ACCOUNT_ID_KEY);}catch(e){}
  if(!a||!/^\d{9}$/.test(a)){
    a=String(Math.floor(100000000+Math.random()*900000000)); // 9 digits, never leading zero
    try{TotaStorage.setItem(ACCOUNT_ID_KEY,a);}catch(e){}
  }
  return a;
}
// Refer-a-friend code: the user's first name + the last 3 digits of their account number.
// Name makes it recognizable/shareable; the account-number digits make it unique per person
// instead of everyone sharing the hardcoded "DOROTHY26".
function referralCode(){
  var first=((seniorName||'Friend').trim().split(/\s+/)[0]||'Friend').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!first)first='FRIEND';
  return first+getAccountNumber().slice(-3);
}
// Load the saved name RIGHT NOW, before anything below this line is built — the demo emails
// a few lines down bake the name into their text at creation, so loading it later (as the old
// init-time call did) left them addressed to "Dorothy" no matter what name was saved.
loadSeniorName();
var synth=window.speechSynthesis,selVoice=null,voiceRate=0.9,voicePitch=1.0,voiceVol=1.0;
var confirmDelay=3,confArcTimer=null,pendingAction=null;
var idleTimer=null,IDLE_MS=15*60*1000;
var medSugVal='',apptSugVal='',spellTimers={};
var updCountdown={d:4,h:23,m:47,s:12},updTimer=null;
var fallActive=false,fallResponseTime=30,fallTimerInterval=null;
var _calNow=new Date();var calYear=_calNow.getFullYear(),calMonth=_calNow.getMonth(),selDay=null,camStream=null;
// Zero-padded YYYY-MM-DD for today — matches the appointment date format so we can compare
// dates as plain strings (todayKey() is NOT padded, so it can't be used for this).
function todayISO(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');}
var plib=['Thank you!','Love you!','How are you?','I took my medication','I need help','Call me please','Talk soon!','I am okay','Miss you!','Good morning!'],learned=[],usage={};
// Dates are computed relative to today so the calendar always has a genuine PAST appointment
// (kept visible for the record) and real UPCOMING ones — no matter when the app is opened.
var appointments=(function(){
  var now=new Date();
  function d(off){var x=new Date(now);x.setDate(x.getDate()+off);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
  return [
    {date:d(-12),time:'10:00',name:'Dr. Patel — Primary Care',loc:'Orlando Medical Center',icon:'🩺'}, // past — retained, not read aloud
    {date:d(5),time:'10:00',name:'Dr. Lee — Dentist',loc:'Bright Smiles Dental',icon:'🦷'},           // upcoming
    {date:d(19),time:'11:00',name:'Dr. Chen — Eye Doctor',loc:'Vision Care of Orlando',icon:'👁️'},     // upcoming
  ];
})();
var allContacts=[{name:'Susan Miller',role:'Daughter (Caregiver)',phone:'(407) 555-0182',avatar:'👧',type:'fam'},{name:'Robert Miller',role:'Son',phone:'(407) 555-0193',avatar:'👴',type:'fam'},{name:'Linda Thompson',role:'Friend',phone:'(407) 555-0147',avatar:'👩',type:'fam'},{name:'Dr. Sarah Patel',role:'Primary Care Physician',phone:'(407) 555-2210',avatar:'🩺',type:'doc'},{name:'Dr. James Lee',role:'Dentist',phone:'(407) 555-3341',avatar:'🦷',type:'doc'},{name:'CVS Pharmacy',role:'Pharmacy',phone:'(407) 555-5500',avatar:'💊',type:'doc'},{name:'Orlando Medical Center',role:'Hospital',phone:'(407) 555-6600',avatar:'🏥',type:'doc'},{name:'Mary Johnson',role:'Neighbor',phone:'(407) 555-0128',avatar:'👵',type:'fam'}];
var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
var selectedPreRecord=1;
var pendingAppName='';
var isEditingApps=false;

// ── HTML-escape helpers — names/urls can come from the device (e.g. "O'Brien",
//    'John "JD" Smith') so escape before putting them in innerHTML or attributes ──
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function escAttr(s){return esc(s);}
function escJs(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}

// ═══ SVG PHONE ICON LIBRARY ═══
// Color via CSS `color` property (fill="currentColor"). White X overlay on call-end is intentional.
var SVG_PHONE_CALL='<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M68.3 60.8c-2.2 2.2-5.7 2.7-8.7 1.2-7.5-3.8-13.8-10-17.6-17.6-1.5-3-1-6.5 1.2-8.7l4.2-4.2c1.4-1.4 1.4-3.6 0-4.9l-9.9-9.9c-1.4-1.4-3.6-1.4-4.9 0L26.5 22c-3.4 3.4-3.7 8.9-.7 12.7C36.6 49 51 63.4 65.3 74.2c3.8 2.9 9.3 2.6 12.7-.7l6.3-6.3c1.4-1.4 1.4-3.6 0-4.9L74.4 52.4c-1.4-1.4-3.6-1.4-4.9 0l-1.2 1.2z" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>';

// Call-in: phone + arrow pointing in (like the green Call-in.png reference)
// V7: bold handset, no inward arrow — stroke fattens the fill path for a thicker, clearer icon
var SVG_PHONE_CALL_IN='<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M68.3 60.8c-2.2 2.2-5.7 2.7-8.7 1.2-7.5-3.8-13.8-10-17.6-17.6-1.5-3-1-6.5 1.2-8.7l4.2-4.2c1.4-1.4 1.4-3.6 0-4.9l-9.9-9.9c-1.4-1.4-3.6-1.4-4.9 0L26.5 22c-3.4 3.4-3.7 8.9-.7 12.7C36.6 49 51 63.4 65.3 74.2c3.8 2.9 9.3 2.6 12.7-.7l6.3-6.3c1.4-1.4 1.4-3.6 0-4.9L74.4 52.4c-1.4-1.4-3.6-1.4-4.9 0l-1.2 1.2z" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>';

// Ringing: phone + sound waves
var SVG_PHONE_RING='<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M68.3 60.8c-2.2 2.2-5.7 2.7-8.7 1.2-7.5-3.8-13.8-10-17.6-17.6-1.5-3-1-6.5 1.2-8.7l4.2-4.2c1.4-1.4 1.4-3.6 0-4.9l-9.9-9.9c-1.4-1.4-3.6-1.4-4.9 0L26.5 22c-3.4 3.4-3.7 8.9-.7 12.7C36.6 49 51 63.4 65.3 74.2c3.8 2.9 9.3 2.6 12.7-.7l6.3-6.3c1.4-1.4 1.4-3.6 0-4.9L74.4 52.4c-1.4-1.4-3.6-1.4-4.9 0l-1.2 1.2z"/><path d="M62 22 Q72 22 72 32" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M62 12 Q82 12 82 32" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>';

// Call-ended: phone + red X badge (matches red Call-end.png reference)
var SVG_PHONE_END='<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M68.3 60.8c-2.2 2.2-5.7 2.7-8.7 1.2-7.5-3.8-13.8-10-17.6-17.6-1.5-3-1-6.5 1.2-8.7l4.2-4.2c1.4-1.4 1.4-3.6 0-4.9l-9.9-9.9c-1.4-1.4-3.6-1.4-4.9 0L26.5 22c-3.4 3.4-3.7 8.9-.7 12.7C36.6 49 51 63.4 65.3 74.2c3.8 2.9 9.3 2.6 12.7-.7l6.3-6.3c1.4-1.4 1.4-3.6 0-4.9L74.4 52.4c-1.4-1.4-3.6-1.4-4.9 0l-1.2 1.2z"/><circle cx="76" cy="22" r="16" fill="#ff3b3b" stroke="#fff" stroke-width="3"/><path d="M70 16l12 12M82 16L70 28" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></svg>';

// Video call icon
var SVG_VIDEO='<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17 10.5V7c0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h12c.6 0 1-.4 1-1v-3.5l4 4v-11l-4 4z"/></svg>';

// Hang-up icon (mirrors call-end)
var SVG_HANGUP='<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(135 50 50)"><path d="M68.3 60.8c-2.2 2.2-5.7 2.7-8.7 1.2-7.5-3.8-13.8-10-17.6-17.6-1.5-3-1-6.5 1.2-8.7l4.2-4.2c1.4-1.4 1.4-3.6 0-4.9l-9.9-9.9c-1.4-1.4-3.6-1.4-4.9 0L26.5 22c-3.4 3.4-3.7 8.9-.7 12.7C36.6 49 51 63.4 65.3 74.2c3.8 2.9 9.3 2.6 12.7-.7l6.3-6.3c1.4-1.4 1.4-3.6 0-4.9L74.4 52.4c-1.4-1.4-3.6-1.4-4.9 0l-1.2 1.2z"/></g></svg>';

// ═══ APPS DATA ═══
var installedApps=[
  {id:'phone',name:'Phone',icon:'☎',url:'tel:',primary:true},
  {id:'facebook',name:'Facebook',icon:'👍',url:'https://facebook.com'},
  {id:'instagram',name:'Instagram',icon:'📷',url:'https://instagram.com'},
  {id:'youtube',name:'YouTube',icon:'▶️',url:'https://youtube.com'},
  {id:'chrome',name:'Browser',icon:'🌐',url:'https://google.com'},
  {id:'maps',name:'Maps',icon:'🗺️',url:'https://maps.google.com'},
  {id:'waze',name:'Waze',icon:'<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="Waze"><path fill="#33ccff" stroke="#fff" stroke-width="1.5" d="M24 4.5C13.2 4.5 4.8 12.8 4.8 23.1c0 4.4 1.6 8.5 4.2 11.7-.5 1.8-1.7 3.4-3.6 4.2 2.5 1.6 5.4 1.3 7.5.2 3.1 1.9 6.9 2.9 11.1 2.9 10.8 0 19.2-8.4 19.2-18.8C43.2 12.8 34.8 4.5 24 4.5z"/><circle cx="17.5" cy="20.5" r="2.5" fill="#10222e"/><circle cx="30.5" cy="20.5" r="2.5" fill="#10222e"/><path d="M16.5 27.5c2 3 5 4.4 7.5 4.4s5.5-1.4 7.5-4.4" stroke="#10222e" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="13" cy="40.5" r="3.6" fill="#10222e" stroke="#fff" stroke-width="1.2"/><circle cx="31" cy="41.5" r="3.6" fill="#10222e" stroke="#fff" stroke-width="1.2"/></svg>',url:'https://www.waze.com/live-map'},
  {id:'weather',name:'Weather',icon:'🌤️',url:'https://weather.com'},
  {id:'amazon',name:'Amazon',icon:'📦',url:'https://amazon.com'},
];
var suggestedApps=[
  // Health & labs — seniors get bloodwork done regularly
  {id:'quest',name:'Quest Diagnostics',icon:'🩸',url:'https://myquest.questdiagnostics.com'},
  {id:'labcorp',name:'Labcorp',icon:'🧪',url:'https://patient.labcorp.com'},
  {id:'mychart',name:'MyChart',icon:'🏥',url:'https://mychart.org'},
  {id:'medicare',name:'Medicare',icon:'⚕️',url:'https://www.medicare.gov'},
  {id:'goodrx',name:'GoodRx',icon:'💊',url:'https://www.goodrx.com'},
  {id:'walgreens',name:'Walgreens',icon:'🏪',url:'https://www.walgreens.com'},
  // Everyday
  {id:'x',name:'X',icon:'✖',url:'https://x.com'},
  {id:'tiktok',name:'TikTok',icon:'🎵',url:'https://tiktok.com'},
  {id:'netflix',name:'Netflix',icon:'🎬',url:'https://netflix.com'},
  {id:'zoom',name:'Zoom',icon:'💻',url:'https://zoom.us'},
  {id:'whatsapp',name:'WhatsApp',icon:'💬',url:'https://web.whatsapp.com'},
  {id:'spotify',name:'Spotify',icon:'🎵',url:'https://open.spotify.com'},
  {id:'pinterest',name:'Pinterest',icon:'📌',url:'https://pinterest.com'},
  {id:'linkedin',name:'LinkedIn',icon:'💼',url:'https://linkedin.com'},
];
// Persisted hub state + blocked (never-suggest) list
var APPS_KEY='totavivo_apps_v1';
var blockedApps=[];
function loadApps(){try{var s=TotaStorage.getItem(APPS_KEY);if(s){var d=JSON.parse(s);if(Array.isArray(d.installed)&&d.installed.length)installedApps=d.installed;if(Array.isArray(d.blocked))blockedApps=d.blocked;}}catch(e){}}
function saveApps(){try{TotaStorage.setItem(APPS_KEY,JSON.stringify({installed:installedApps,blocked:blockedApps}));}catch(e){}}

// ═══ EMAILS DATA ═══
var emailsData=[
  {id:1,from:'CVS Pharmacy',avatar:'💊',subject:'Your prescription is ready for pickup',preview:'Your Metformin prescription is ready at CVS Orlando.',time:'8:02 AM',unread:true,category:'medical',fullText:'Dear '+seniorName+', Your prescription for Metformin 500mg (Qty: 60 tablets) is ready for pickup at CVS Pharmacy, 1234 Orange Ave, Orlando FL. Pickup by May 8, 2026. Co-pay: $4.00.',aiSummary:'CVS says your Metformin is ready to pick up. Cost is $4. Deadline: May 8.'},
  {id:2,from:'Medicare',avatar:'🏥',subject:'Your Medicare Summary — April 2026',preview:'Medicare Part B claims for April are now available.',time:'7:45 AM',unread:true,category:'medical',fullText:'Dear '+seniorName+', Your Medicare Summary for April 2026 is available. Total claims: $340.00. Your responsibility: $68.00.',aiSummary:'Medicare processed 2 claims in April. You owe $68.00 total.'},
  {id:3,from:'Susan Miller',avatar:'👧',subject:'Mom — Thursday reminder!',preview:"Don't forget Dr. Patel is Thursday at 10am! I'll drive you ❤️",time:'Yesterday',unread:true,category:'family',fullText:"Hi Mom! Dr. Patel is this Thursday May 8th at 10 AM. I'll pick you up at 9:15 AM. Bring your insurance card and medication list. Love you! ❤️ — Susan",aiSummary:'Susan will pick you up Thursday at 9:15 AM for Dr. Patel at 10 AM. Bring insurance card and medication list.'},
  {id:4,from:'Duke Energy',avatar:'⚡',subject:'Your bill is due May 7 — $82.40',preview:'Your May electric bill is due in 3 days.',time:'Yesterday',unread:false,category:'bills',fullText:'Account: '+seniorName+'. Amount Due: $82.40. Due Date: May 7, 2026. Pay online at duke-energy.com or call 1-800-777-9898.',aiSummary:'Your electric bill is $82.40, due May 7 — 3 days from now. Not on AutoPay.'},
];
var filteredEmails=[...emailsData];
var expandedEmail=null;

// ═══ NAV DATA — Double Stack with usage tracking ═══
// Top row order is sorted by `uses` desc — to get Home, Phone, ..., Apps as top row of 6,
// Phone is 99 (right after Home), and Apps is lowered to 55 so it sits last in the first row.
var navItems=[
  {id:'home',icon:'🏠',label:'Home',uses:100},
  {id:'phone',icon:'☎',label:'Phone',uses:99,svg:true},
  {id:'email',icon:'📧',label:'Email',uses:75},
  {id:'medicine',icon:'💊',label:'Meds',uses:70},
  {id:'messages',icon:'💬',label:'Chat',uses:60},
  {id:'apps',icon:'📱',label:'Apps',uses:55},
  // Second row
  {id:'earn',icon:'💰',label:'Earn',uses:52},
  {id:'bills',icon:'💳',label:'Bills',uses:50},
  {id:'smarthome',icon:'🏡',label:'Smart',uses:48},
  {id:'calendar',icon:'📅',label:'Calendar',uses:40},
  {id:'contacts',icon:'👥',label:'Contacts',uses:35},
  {id:'caregiver',icon:'👨‍👩‍👧',label:'Family',uses:30},
  {id:'accident',icon:'🚗',label:'Accident',uses:29},
  {id:'bluetooth',icon:'📶',label:'Bluetooth',uses:25},
  {id:'magnifier',icon:'🔍',label:'Magnify',uses:20},
  {id:'ifttt',icon:'🔁',label:'IFTTT',uses:18},
  {id:'settings',icon:'⚙️',label:'Settings',uses:15},
];
var TOP_COUNT=6; // top row items

// NAV TITLES/BREADCRUMBS
var titles={home:'Good Morning',phone:'Phone',apps:'My Apps Hub',email:'My Emails',medicine:'Medications',calendar:'Calendar',contacts:'My Contacts',magnifier:'Magnify & Scan',bills:'Bill Hub',messages:'Messages',caregiver:'Family & Caregiver',settings:'Customize',smarthome:'Smart Home Interface',ifttt:'IFTTT Automations',bluetooth:'Bluetooth',earn:'Earn Money',sensors:'Sensors & Permissions',insights:'Insights',bank:'Bank Statement',checking:'Checking',accident:'Accident Assistant'};
var bcs={home:'<b>🏠 Home</b>',phone:'🏠 › <b>☎ Phone</b>',apps:'🏠 › <b>📱 Apps</b>',email:'🏠 › <b>📧 Email</b>',medicine:'🏠 › <b>💊 Meds</b>',calendar:'🏠 › <b>📅 Calendar</b>',contacts:'🏠 › <b>👥 Contacts</b>',magnifier:'🏠 › <b>🔍 Magnify</b>',bills:'🏠 › <b>💳 Bills</b>',messages:'🏠 › <b>💬 Chat</b>',caregiver:'🏠 › <b>👨‍👩‍👧 Family</b>',settings:'🏠 › <b>⚙️ Settings</b>',smarthome:'🏠 › <b>🏡 Smart Home Interface</b>',ifttt:'🏠 › <b>🔁 IFTTT</b>',bluetooth:'🏠 › <b>📶 Bluetooth</b>',earn:'🏠 › <b>💰 Earn</b>',sensors:'🏠 › <b>📡 Sensors</b>',insights:'🏠 › <b>📊 Insights</b>',bank:'🏠 › <b>🏦 Bank Statement</b>',checking:'🏠 › <b>💵 Checking</b>',accident:'🏠 › <b>🚗 Accident Assistant</b>'};

// ═══ BUILD SINGLE-ROW NAV ═══
// Only these 6 ids appear in the bottom nav. Apps moved to the top action bar (V7); Calendar takes its slot.
var NAV_VISIBLE=['home','phone','email','medicine','messages','calendar'];
function buildNav(){
  var visible=NAV_VISIBLE.map(id=>navItems.find(n=>n.id===id)).filter(Boolean);
  var topRow=document.getElementById('bnav-top');
  var botRow=document.getElementById('bnav-bottom');
  topRow.innerHTML='';
  if(botRow)botRow.innerHTML='';
  // Hide the labels & second row (visually collapse to one bar)
  document.querySelectorAll('.bnav-label').forEach(l=>l.style.display='none');
  if(botRow)botRow.style.display='none';
  function makeBtn(item){
    var btn=document.createElement('button');
    btn.className='nbtn';btn.id='nav-'+item.id;
    var iconHTML=item.svg
      ?'<span class="ni nav-phone-ico">'+SVG_PHONE_CALL_IN+'</span>'
      :'<span class="ni">'+item.icon+'</span>';
    btn.innerHTML=iconHTML+'<span class="nl">'+item.label+'</span>';
    btn.onclick=()=>switchTab(item.id);
    return btn;
  }
  visible.forEach(item=>topRow.appendChild(makeBtn(item)));
}

function switchTab(t){
  // Feature gate: bounce if the user turned this feature off in Settings → Features
  if(typeof featureFlags!=='undefined' && featureFlags[t]===false){
    showToast('That feature is off — turn it on in Settings → Features');
    return;
  }
  if(typeof logEvent==='function')logEvent('screen_viewed',{screen:t});
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(b=>b.classList.remove('active'));
  document.getElementById('s-'+t).classList.add('active');
  var nb=document.getElementById('nav-'+t);if(nb)nb.classList.add('active');
  document.getElementById('pg-title').textContent=titles[t]||t;
  var bcEl=document.getElementById('bc');if(bcEl)bcEl.innerHTML=bcs[t]||'<b>🏠 Home</b>'; // breadcrumb removed in v7.3 (search bar took its place) — guard kept for safety
  if(typeof hideSearchResults==='function')hideSearchResults(false);
  hideUndo();resetIdle();
  // Track usage — bump count and rebuild nav
  var item=navItems.find(n=>n.id===t);
  if(item){item.uses++;saveModuleUsage();if(item.id!=='home')buildNav();renderPriorityModules();}
  // Screen-specific inits
  if(t==='messages')renderSugs('');
  if(t==='calendar')renderCalendar();
  if(t==='contacts')renderContacts('');
  if(t==='email')renderEmails(filteredEmails);
  if(t==='medicine'&&typeof logEvent==='function'){document.querySelectorAll('#med-list .mi').forEach(mi=>{var mt=mi.querySelector('.mt');var mn=mi.querySelector('.mn');if(mt&&mn&&/Due\s*(NOW|now)|Due\s+in/i.test(mt.textContent))logEvent('medication_reminder_shown',{med:mn.textContent});});}
  if(t==='home'){renderBalanceTiles();renderWeather&&renderWeather();renderPriorityModules();}
  // Money screens all read from the same balanceState ledger — refresh on entry so the
  // Bank, Checking, Bill Hub totals and Pay-button fills can never drift out of sync.
  if(t==='bills'||t==='checking'||t==='bank'){if(typeof renderMoneyScreens==='function')renderMoneyScreens();}
  if(t==='apps')renderAppsHub();
  if(t==='phone')renderPhoneScreen();
  if(t==='earn')renderEarn();
  if(t==='caregiver')renderFamily();
  if(t==='smarthome')renderSmartHome();
  if(t==='ifttt')renderIfttt();
  if(t==='bluetooth')renderBluetooth();
  if(t==='sensors'){renderSensorHub();initBattery();initStorage();checkMediaPerms();initNetwork();}
  if(t==='insights')renderInsights();
  if(t!=='magnifier')stopCam();
  showSyncIndicator();
  if(typeof autoReadScreen==='function')autoReadScreen(t); // read-aloud verbosity (Voice Settings)
}

// ═══ VIEW MODE ═══
// The floating Phone/Web toggle is desktop-only: on a phone it just covered the app.
// Phones still switch modes through Settings → Display Mode.
function canShowViewToggle(){return window.matchMedia&&matchMedia('(hover: hover) and (pointer: fine)').matches&&window.innerWidth>600;}
function setViewMode(mode,btn){
  document.querySelectorAll('.vt-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(mode==='web') document.body.classList.add('web-mode');
  else document.body.classList.remove('web-mode');
  if(canShowViewToggle())document.getElementById('view-toggle').style.display='flex';
  showToast(mode==='web'?'🖥 Web view — larger for easy reading':'📱 Phone view');
}
function setViewFromSettings(mode,el){
  if(mode==='web'){document.getElementById('tog-phone').classList.remove('on');el.classList.add('on');document.body.classList.add('web-mode');if(canShowViewToggle())document.getElementById('view-toggle').style.display='flex';}
  else{document.getElementById('tog-web').classList.remove('on');el.classList.add('on');document.body.classList.remove('web-mode');}
  showToast(mode==='web'?'🖥 Switched to web view':'📱 Switched to phone view');
}

// ── TotaVivo's own time/battery strip (.sbar) ──
// In a phone browser the device's real status bar sits directly above the app showing the
// same time/battery — duplicating it just wastes a row. There's no web API to ask "is the
// OS bar visible?", so the auto rule is: hide in a phone-sized browser, show when installed
// standalone or on a desktop. The Settings toggle overrides auto either way, permanently.
var SBAR_KEY='totavivo_statusbar_v1';
function isStandaloneApp(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;}
function sbarShouldShow(){
  var pref=null;try{pref=TotaStorage.getItem(SBAR_KEY);}catch(e){}
  if(pref==='1')return true;
  if(pref==='0')return false;
  // Auto: show when installed as an app or on a desktop-class window — a touch phone's
  // browser already has the device's own time/battery right above the page.
  return isStandaloneApp()||(window.matchMedia&&matchMedia('(hover: hover) and (pointer: fine)').matches&&window.innerWidth>600);
}
function applySbarPref(){
  var sb=document.querySelector('.sbar');if(sb)sb.style.display=sbarShouldShow()?'flex':'none';
  var t=document.getElementById('tog-sbar');if(t)t.classList.toggle('on',sbarShouldShow());
}
function toggleSbar(){
  var on=!sbarShouldShow();
  try{TotaStorage.setItem(SBAR_KEY,on?'1':'0');}catch(e){}
  applySbarPref();
  showToast(on?'🕐 TotaVivo status bar shown':'🕐 Hidden — your phone already shows time & battery');
  if(typeof logEvent==='function')logEvent('statusbar_toggled',{shown:on});
}

// ═══ REAL-TIME SYNC INDICATOR ═══
function showSyncIndicator(){
  var el=document.getElementById('sync-indicator');
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2000);
}

// ═══ APPS HUB ═══
function renderAppsHub(){
  var grid=document.getElementById('apps-grid');
  grid.className='apps-grid'+(isEditingApps?' apps-editing':'');
  grid.innerHTML=installedApps.map(app=>`
    <div class="app-tile${app.primary?' phone-tile':''}" onclick="openApp('${escJs(app.id)}','${escJs(app.name)}','${escJs(app.url||'')}')">
      <div class="at-icon">${app.primary?SVG_PHONE_CALL_IN:(/^\s*<svg/i.test(app.icon)?app.icon:esc(app.icon))}</div>
      <div class="at-name">${esc(app.name)}</div>
      ${app.primary?'':`<div class="at-remove" onclick="event.stopPropagation();removeApp('${escJs(app.id)}')" title="Remove">✕</div>`}
      ${(app.primary||!isEditingApps)?'':`<div class="at-block" onclick="event.stopPropagation();blockApp('${escJs(app.id)}')" title="Hide from suggestions">🚫</div>`}
    </div>
  `).join('')+'<div class="app-tile add-tile" onclick="document.getElementById(\'app-search\').focus()"><div class="at-icon" style="font-size:22px;color:var(--a2)">➕</div><div class="at-name" style="color:var(--a2)">Add App</div></div>';
  renderAppSuggestions('');
  renderBlockedApps();
}

function openApp(id,name,url){
  if(isEditingApps)return;
  // Phone tile: open the dialer (s-phone with favorites + dial pad)
  // Color cycle: idle (lt blue) → in-use (green RING) → ended (red END) → idle (lt blue)
  if(id==='phone'){
    var tile=document.querySelector('.app-tile.phone-tile');
    var iconEl=tile?tile.querySelector('.at-icon'):null;
    if(tile&&iconEl){
      tile.classList.remove('ended');tile.classList.add('in-use');
      iconEl.innerHTML=SVG_PHONE_RING;
      setTimeout(()=>{tile.classList.remove('in-use');tile.classList.add('ended');iconEl.innerHTML=SVG_PHONE_END;},1500);
      setTimeout(()=>{tile.classList.remove('ended');iconEl.innerHTML=SVG_PHONE_CALL_IN;},2800);
    }
    speak('Opening your phone.');
    showToast('☎ Opening Phone…');
    switchTab('phone');
    return;
  }
  speak('Opening '+name+'.');
  showToast('📱 Opening '+name+'…');
  if(url&&url!=='tel:') window.open(url,'_blank');
  // Simulate "do you want to add" for unlisted apps
  if(!installedApps.find(a=>a.id===id)){
    pendingAppName=name;
    setTimeout(()=>showAddAppPrompt(name),1000);
  }
}

function toggleEditApps(){
  isEditingApps=!isEditingApps;
  document.getElementById('edit-apps-btn').textContent=isEditingApps?'✅ Done':'✏️ Edit';
  renderAppsHub();
  showToast(isEditingApps?'Tap ✕ on any app to remove it':'Done editing');
}

function removeApp(id){
  var app=installedApps.find(a=>a.id===id);
  if(app&&app.primary){showToast('The Phone app stays — it can\'t be removed');return;}
  installedApps=installedApps.filter(a=>a.id!==id);
  saveApps();renderAppsHub();
  showToast('App removed (still in Add an App)');
  showSyncIndicator();
}
function blockApp(id){
  var app=installedApps.find(a=>a.id===id);
  if(app&&app.primary){showToast('The Phone app can\'t be hidden');return;}
  installedApps=installedApps.filter(a=>a.id!==id);
  if(blockedApps.indexOf(id)<0)blockedApps.push(id);
  saveApps();renderAppsHub();
  showToast('🚫 Hidden — won\'t be suggested again');
  if(typeof logEvent==='function')logEvent('app_blocked',{app:id});
  showSyncIndicator();
}
function unblockApp(id){
  blockedApps=blockedApps.filter(b=>b!==id);
  saveApps();renderAppsHub();
  showToast('Restored — you can add it again');
}
function renderBlockedApps(){
  var card=document.getElementById('blocked-apps-card'),list=document.getElementById('blocked-apps-list');
  if(!card||!list)return;
  if(!blockedApps.length){card.style.display='none';return;}
  card.style.display='block';
  list.innerHTML=blockedApps.map(function(id){
    var a=suggestedApps.find(x=>x.id===id)||{id:id,name:id,icon:'📱'};
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(80,140,255,.1)"><span style="font-size:18px">'+esc(a.icon)+'</span><span style="flex:1;font-size:12px;font-weight:700;color:var(--text)">'+esc(a.name)+'</span><button onclick="unblockApp(\''+escJs(id)+'\')" style="background:rgba(0,224,150,.15);color:var(--green);border:1.5px solid rgba(0,224,150,.35);border-radius:7px;padding:5px 10px;font-size:10px;font-weight:800;cursor:pointer">↩ Restore</button></div>';
  }).join('');
}

function searchApps(val){renderAppSuggestions(val);}
function renderAppSuggestions(val){
  var sug=document.getElementById('app-suggestions');
  var v=val.toLowerCase();
  var pool=suggestedApps.filter(a=>blockedApps.indexOf(a.id)<0 && !installedApps.find(i=>i.id===a.id));
  var all=[...pool,...(v?[{id:'custom',name:val,icon:'📱'}]:[])];
  var filtered=!v?pool:all.filter(a=>a.name.toLowerCase().includes(v));
  sug.innerHTML=filtered.slice(0,10).map(a=>`<div class="app-sug-pill"><span onclick="addAppFromSug('${escJs(a.id)}','${escJs(a.name)}','${escJs(a.icon)}','${escJs(a.url||'')}')" style="cursor:pointer">${esc(a.icon)} ${esc(a.name)}</span>${a.id==='custom'?'':`<span class="sug-block" onclick="blockSuggestion('${escJs(a.id)}')" title="Hide this suggestion">✕</span>`}</div>`).join('')||'<div style="font-size:11px;color:var(--sub);font-style:italic;padding:4px">No more suggestions.</div>';
}
function blockSuggestion(id){
  if(blockedApps.indexOf(id)<0)blockedApps.push(id);
  saveApps();renderAppSuggestions(document.getElementById('app-search').value||'');renderBlockedApps();
  showToast('🚫 Hidden from suggestions');
  if(typeof logEvent==='function')logEvent('app_blocked',{app:id,from:'suggestion'});
}

function addAppFromSug(id,name,icon,explicitUrl){
  // Custom-typed apps all arrive as id='custom' — derive a real, unique id from the name
  if(id==='custom'||!id){id=(name.toLowerCase().replace(/[^a-z0-9]/g,'')||('app'+Date.now().toString(36)));while(installedApps.find(a=>a.id===id))id+='x';}
  if(installedApps.find(a=>a.id===id)){showToast(name+' is already in your hub');return;}
  blockedApps=blockedApps.filter(b=>b!==id);
  var url=explicitUrl||('https://'+name.toLowerCase().replace(/[^a-z]/g,'')+'.com');
  installedApps.push({id,name,icon,url});
  document.getElementById('app-search').value='';
  saveApps();renderAppsHub();
  speak(name+' added to your apps hub.');
  showToast('✅ '+name+' added to your Apps Hub!');
  if(typeof logEvent==='function')logEvent('app_added',{app:id});
  showSyncIndicator();
}

function showAddAppPrompt(name){
  pendingAppName=name;
  document.getElementById('aat-title').textContent='📱 Add '+name+' to TotaVivo?';
  document.getElementById('add-app-toast').classList.add('show');
  speak('Would you like to add '+name+' to your TotaVivo apps hub for easy access next time?');
}
function confirmAddApp(){
  document.getElementById('add-app-toast').classList.remove('show');
  if(pendingAppName){
    var id=pendingAppName.toLowerCase().replace(/[^a-z0-9]/g,'')||('app'+Date.now().toString(36));
    while(installedApps.find(a=>a.id===id))id+='x';
    installedApps.push({id:id,name:pendingAppName,icon:'📱'});
    saveApps();renderAppsHub();
    speak(pendingAppName+' has been added to your apps hub.');
    showToast('✅ '+pendingAppName+' added to your Apps Hub!');
    if(typeof logEvent==='function')logEvent('app_added',{app:id,from:'prompt'});
    showSyncIndicator();
  }
}
function dismissAddApp(){document.getElementById('add-app-toast').classList.remove('show');}

// ═══ CONFIRM ═══
// code can be a string (eval'd) OR a function. Prefer functions when the action needs the
// clicked element — a string eval'd here runs with `this`===window, which silently crashed
// doPay(this,...) so bills never actually got paid. payBill() below passes a closure instead.
var pendingActionFn=null;
function trigConf(label,code){if(confirmDelay===0){if(typeof code==='function'){code();}else{eval(code);}return;}if(typeof code==='function'){pendingActionFn=code;pendingAction=null;}else{pendingAction=code;pendingActionFn=null;}document.getElementById('cba').textContent=label;document.getElementById('conf-ov').classList.add('show');var total=confirmDelay*1000,start=Date.now(),arc=document.getElementById('carc'),num=document.getElementById('cnum');clearInterval(confArcTimer);confArcTimer=setInterval(()=>{var elapsed=Date.now()-start,frac=Math.min(elapsed/total,1);arc.style.strokeDashoffset=175.9-(175.9*frac);num.textContent=Math.max(0,Math.ceil((total-elapsed)/1000));if(frac>=1){clearInterval(confArcTimer);confirmAct();}},50);}
function confirmAct(){clearInterval(confArcTimer);document.getElementById('conf-ov').classList.remove('show');if(pendingActionFn){var fn=pendingActionFn;pendingActionFn=null;pendingAction=null;fn();}else if(pendingAction){eval(pendingAction);pendingAction=null;}}
// Pay a bill with the real button element captured in a closure (never window).
function payBill(btn,name,amt){trigConf('Pay '+name+' '+amt,(function(b){return function(){doPay(b,name,amt);};})(btn));}
function cancelConf(){clearInterval(confArcTimer);document.getElementById('conf-ov').classList.remove('show');pendingAction=null;showToast('↩ Cancelled — no action taken');}
function setDly(v,el){confirmDelay=v;document.querySelectorAll('#delay-grid .delay-opt').forEach(d=>d.classList.remove('active'));el.classList.add('active');showToast(v===0?'Delay OFF':'Delay: '+v+'s');}

// ═══ IDLE ═══
function resetIdle(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{switchTab('home');showToast('🏠 Returned to Home after 15 minutes');},IDLE_MS);}
document.addEventListener('touchstart',resetIdle,{passive:true});
document.addEventListener('mousedown',resetIdle);
resetIdle();

// ═══ CALENDAR ═══
function renderCalendar(){
  var grid=document.getElementById('cal-grid');
  var headers=Array.from(grid.children).slice(0,7);grid.innerHTML='';headers.forEach(h=>grid.appendChild(h));
  document.getElementById('cal-month-lbl').textContent=months[calMonth]+' '+calYear;
  var firstDay=new Date(calYear,calMonth,1).getDay();
  var daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  var today=new Date();var todayStr=today.getFullYear()+'-'+pad2(today.getMonth()+1)+'-'+pad2(today.getDate());
  var apptDays={};appointments.forEach(a=>{var p=a.date.split('-');if(parseInt(p[1])-1===calMonth&&parseInt(p[0])===calYear)apptDays[parseInt(p[2])]=true;});
  for(var i=0;i<firstDay;i++){var d=document.createElement('div');d.className='cal-day empty';d.innerHTML='<span class="dn">.</span>';grid.appendChild(d);}
  for(var day=1;day<=daysInMonth;day++){
    var dateStr=calYear+'-'+pad2(calMonth+1)+'-'+pad2(day);
    var div=document.createElement('div');
    div.className='cal-day'+(dateStr===todayStr?' today':'')+(apptDays[day]?' has-appt':'')+(selDay===dateStr?' selected':'');
    div.innerHTML='<span class="dn">'+day+'</span>'+(apptDays[day]?'<div class="cdot"></div>':'');
    div.onclick=(function(ds,dy){return function(){selDay=ds;renderCalendar();showDayAppts(ds,dy);};})(dateStr,day);
    grid.appendChild(div);
  }
  showMonthAppts();
}
function showDayAppts(dateStr,day){var lbl=document.getElementById('cal-day-label');var list=document.getElementById('cal-appt-list');var p=dateStr.split('-');lbl.textContent='📅 '+months[parseInt(p[1])-1]+' '+day;var da=appointments.filter(a=>a.date===dateStr);if(!da.length){list.innerHTML='<div class="cal-empty">No appointments — open day ✓</div>';return;}list.innerHTML=da.map(a=>'<div class="cal-appt-item"><span class="cat">'+a.icon+'</span><div class="cai"><div class="cain">'+a.name+'</div><div class="cait">⏰ '+formatTime(a.time)+' · 📍 '+a.loc+'</div></div></div>').join('');}
function showMonthAppts(){var lbl=document.getElementById('cal-day-label');var list=document.getElementById('cal-appt-list');lbl.textContent='📋 '+months[calMonth]+' Appointments';var mo=appointments.filter(a=>{var p=a.date.split('-');return parseInt(p[1])-1===calMonth&&parseInt(p[0])===calYear;}).sort((a,b)=>a.date.localeCompare(b.date));if(!mo.length){list.innerHTML='<div class="cal-empty">No appointments this month</div>';return;}list.innerHTML=mo.map(a=>{var p=a.date.split('-');return'<div class="cal-appt-item"><span class="cat">'+a.icon+'</span><div class="cai"><div class="cain">'+a.name+'</div><div class="cait">📅 '+months[parseInt(p[1])-1]+' '+parseInt(p[2])+' · ⏰ '+formatTime(a.time)+' · 📍 '+a.loc+'</div></div></div>';}).join('');}
function changeMonth(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}selDay=null;renderCalendar();}
function addAppt(){var name=document.getElementById('appt-inp').value.trim()||apptSugVal;var date=document.getElementById('appt-date').value;var time=document.getElementById('appt-time').value||'09:00';var loc=document.getElementById('appt-loc').value.trim()||'Location TBD';if(!name){showToast('Please enter appointment details');return;}if(!date){showToast('Please select a date');return;}appointments.push({date,time,name,loc,icon:'🩺'});['appt-inp','appt-date','appt-time','appt-loc'].forEach(id=>document.getElementById(id).value='');apptSugVal='';hideSug('appt');speak('Appointment added.');showToast('✅ Appointment added!');renderCalendar();showSyncIndicator();}
function formatTime(t){if(!t)return'';var p=t.split(':');var h=parseInt(p[0]),m=p[1],ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m+' '+ap;}
function pad2(n){return String(n).padStart(2,'0');}
function upcomingAppts(){var t=todayISO();return appointments.slice().filter(function(a){return a.date>=t;}).sort(function(a,b){return a.date.localeCompare(b.date);});}
function speakAppts(){
  // Past appointments stay visible in the calendar, but are never read aloud — only what's
  // still coming up is spoken, so the user isn't reminded about visits that already happened.
  var up=upcomingAppts();
  if(!up.length){speak('You have no appointments coming up.');return;}
  var parts=up.map(function(a){var p=a.date.split('-');return a.name+', '+months[parseInt(p[1])-1]+' '+parseInt(p[2])+' at '+formatTime(a.time);});
  speak('Your upcoming appointments: '+parts.join('. Next, ')+'.');
}

// ═══ CONTACTS ═══
function renderContacts(filter){var list=document.getElementById('contact-list');var f=filter.toLowerCase();var filtered=allContacts.filter(c=>!f||c.name.toLowerCase().includes(f)||c.role.toLowerCase().includes(f));var fam=filtered.filter(c=>c.type==='fam');var doc=filtered.filter(c=>c.type==='doc');var html='';if(fam.length){html+='<div class="contact-group-label">👨‍👩‍👧 Family &amp; Friends</div>';fam.forEach(c=>{html+=contactHTML(c);});}if(doc.length){html+='<div class="contact-group-label">🏥 Medical &amp; Services</div>';doc.forEach(c=>{html+=contactHTML(c);});}if(!filtered.length)html='<div style="font-size:13px;color:var(--sub);text-align:center;padding:18px">No contacts found</div>';list.innerHTML=html;
  list.querySelectorAll('.cact.call').forEach(btn=>{btn.onclick=()=>{
    var iconHolder=btn;
    btn.classList.remove('ended');btn.classList.add('in-use');btn.innerHTML=SVG_PHONE_RING;
    showToast('☎ Calling '+btn.dataset.name+'…');speak('Calling '+btn.dataset.name+'.');
    setTimeout(()=>{btn.classList.remove('in-use');btn.classList.add('ended');btn.innerHTML=SVG_PHONE_END;},3000);
    setTimeout(()=>{btn.classList.remove('ended');btn.innerHTML=SVG_PHONE_CALL_IN;},5000);
  };});
  list.querySelectorAll('.cact.video').forEach(btn=>{
    var c=allContacts.find(x=>x.name===btn.dataset.name);
    btn.onclick=()=>startVideoCall(btn.dataset.name,c?c.phone:'');
  });
  list.querySelectorAll('.cact.msg').forEach(btn=>{btn.onclick=()=>{switchTab('messages');showToast('Opening chat with '+btn.dataset.name);};});
}
function contactHTML(c){
  var editBtn=isEditingContacts?'<button class="cact edit" onclick="openEditContact(\''+escJs(c.name)+'\')" title="Edit contact">✏️</button>':'';
  return '<div class="contact-item">'
    +'<div class="contact-avatar '+esc(c.type)+'">'+esc(c.avatar)+'</div>'
    +'<div class="contact-info"><div class="cnm">'+esc(c.name)+'</div><div class="crl">'+esc(c.role)+'</div><div class="cph">'+esc(c.phone)+'</div></div>'
    +'<div class="contact-actions">'
    +'<button class="cact call" data-name="'+escAttr(c.name)+'" title="Voice call">'+SVG_PHONE_CALL_IN+'</button>'
    +'<button class="cact video" data-name="'+escAttr(c.name)+'" title="Video call">'+SVG_VIDEO+'</button>'
    +'<button class="cact msg" data-name="'+escAttr(c.name)+'" title="Message">💬</button>'
    +editBtn
    +'</div></div>';
}
function filterContacts(val){renderContacts(val);}
function syncContacts(){showToast('📱 Syncing…');setTimeout(()=>{allContacts.push({name:'Mike Wilson',role:'From your phone',phone:'(407) 555-8819',avatar:'👦',type:'fam'});renderContacts('');showToast('✅ 1 new contact synced!');speak('1 new contact imported.');},1500);}

// ═══ CROSS-DEVICE SYNC (optional, off by default) ═══
var SYNC_URL='https://ajnrdsikcoudpixcyycr.supabase.co';
var SYNC_KEY='sb_publishable_gUpBw1odBA2MdcTsyDufTA_IoPzc0ej';
var syncClient=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(SYNC_URL,SYNC_KEY):null;
var SYNC_STATE_KEY='totavivo_sync_v1';
var syncState={linked:false,userId:null,email:null,householdId:null,role:null};
var pendingSyncEmail='';
// Only these push to the caregiver's synced activity feed — keeps it meaningful
// (skips noisy technical events like screen_viewed, app_foregrounded, search_typed)
var SYNC_ACTIVITY_EVENTS=['call_initiated','911_initiated','video_call_initiated','video_call_ended','message_sent',
  'medication_taken_logged','medication_missed_confirmed','bill_paid',
  'fall_event_triggered','fall_auto_detected','fall_alert_acknowledged','fall_help_requested','fall_alert_no_response','caregiver_escalation_initiated',
  'contact_added','contact_edited','contact_deleted','contact_added_from_dialer',
  'earn_cashout','steps_goal_reached'];
function loadSyncState(){try{var s=TotaStorage.getItem(SYNC_STATE_KEY);if(s)Object.assign(syncState,JSON.parse(s));}catch(e){}}
function saveSyncState(){try{TotaStorage.setItem(SYNC_STATE_KEY,JSON.stringify(syncState));}catch(e){}}

// ── CAREGIVER PREMIUM — $9.99/mo, builds on top of Sync. The free caregiver dashboard
// (activity summary, inactivity alert, 1 caregiver) stays free forever; Premium only adds
// extra depth (more caregivers, full activity history, CSV export). Subscription status is
// stored server-side in Supabase and only ever WRITTEN by the Stripe webhook handler — this
// client only ever reads it. See Backend/schema-subscriptions.sql for the enforcement.
var SUBSCRIPTION_STATE_KEY='totavivo_subscription_v1';
var subState={tier:'free',status:'none',currentPeriodEnd:null};
// Set once the Supabase Edge Functions are deployed (Backend/edge-function-*.ts) — until then
// the Upgrade/Manage buttons explain they're not live yet instead of failing silently.
var STRIPE_CHECKOUT_FN_URL='';
var STRIPE_PORTAL_FN_URL='';
function loadSubState(){try{var s=TotaStorage.getItem(SUBSCRIPTION_STATE_KEY);if(s)Object.assign(subState,JSON.parse(s));}catch(e){}}
function saveSubState(){try{TotaStorage.setItem(SUBSCRIPTION_STATE_KEY,JSON.stringify(subState));}catch(e){}}
function isPremium(){return subState.tier==='caregiver_premium'&&subState.status==='active';}
function syncPullSubscription(){
  if(!syncClient||!syncState.householdId)return;
  syncClient.from('subscriptions').select('*').eq('household_id',syncState.householdId).maybeSingle().then(function(res){
    if(res.data){
      subState.tier=res.data.tier||'free';
      subState.status=res.data.status||'none';
      subState.currentPeriodEnd=res.data.current_period_end||null;
    }else{
      subState.tier='free';subState.status='none';subState.currentPeriodEnd=null;
    }
    saveSubState();
    renderSubscriptionUI();
    if(document.getElementById('s-caregiver').classList.contains('active'))syncPullActivity();
  });
}
function renderSubscriptionUI(){
  var card=document.getElementById('premium-card');if(!card)return;
  card.style.display=syncState.linked?'block':'none';
  var freeView=document.getElementById('premium-free-view');
  var activeView=document.getElementById('premium-active-view');
  if(freeView)freeView.style.display=isPremium()?'none':'block';
  if(activeView)activeView.style.display=isPremium()?'block':'none';
}
// Both functions below authenticate with the signed-in user's own session token (not the
// public anon key) — the Edge Functions verify that token and independently confirm the
// caller actually belongs to the household they're requesting, so a household_id sent from
// the client alone is never enough on its own to act on someone else's subscription.
function upgradeToPremium(){
  if(!syncState.linked){showToast('Link sync first — Caregiver Premium builds on top of Sync');return;}
  if(!STRIPE_CHECKOUT_FN_URL){showToast('💳 Caregiver Premium checkout is being finished up — check back soon');return;}
  showToast('Opening secure checkout…');
  syncClient.auth.getSession().then(function(sessRes){
    var token=sessRes.data&&sessRes.data.session?sessRes.data.session.access_token:null;
    if(!token){showToast('Please verify your email again to continue');return;}
    fetch(STRIPE_CHECKOUT_FN_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({householdId:syncState.householdId})
    }).then(function(r){return r.json();}).then(function(data){
      if(data&&data.url)window.location.href=data.url;
      else showToast('Could not start checkout — try again');
    }).catch(function(){showToast('Could not start checkout — try again');});
  });
}
function manageSubscription(){
  if(!STRIPE_PORTAL_FN_URL){showToast('Subscription management is being finished up — check back soon');return;}
  syncClient.auth.getSession().then(function(sessRes){
    var token=sessRes.data&&sessRes.data.session?sessRes.data.session.access_token:null;
    if(!token){showToast('Please verify your email again to continue');return;}
    fetch(STRIPE_PORTAL_FN_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({householdId:syncState.householdId})
    }).then(function(r){return r.json();}).then(function(data){
      if(data&&data.url)window.location.href=data.url;
      else showToast('Could not open subscription management — try again');
    }).catch(function(){showToast('Could not open subscription management — try again');});
  });
}
function exportActivityHistory(){
  if(!isPremium()){showToast('📥 Exporting the full activity history is a Caregiver Premium feature');return;}
  if(!syncClient||!syncState.linked){showToast('Link sync first');return;}
  syncClient.from('activity_log').select('*').eq('household_id',syncState.householdId).order('created_at',{ascending:false}).then(function(res){
    if(res.error||!res.data){showToast('Could not export — try again');return;}
    var rows=res.data.map(function(ev){
      return [ev.created_at,ev.event_type,JSON.stringify(ev.detail||{})].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
    });
    var csv='Date,Event,Details\n'+rows.join('\n');
    var blob=new Blob([csv],{type:'text/csv'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='totavivo-activity-export.csv';document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
    if(typeof logEvent==='function')logEvent('activity_history_exported',{});
    showToast('📥 Activity history exported');
  });
}

function syncSendCode(){
  var emailEl=document.getElementById('sync-email');
  var email=emailEl?emailEl.value.trim():'';
  if(!email||email.indexOf('@')<0){showToast('Enter a valid email');return;}
  if(!syncClient){showToast('Sync is temporarily unavailable — try again later');return;}
  pendingSyncEmail=email;
  var btn=document.getElementById('sync-send-btn');if(btn)btn.disabled=true;
  showToast('📧 Sending code to '+email+'…');
  syncClient.auth.signInWithOtp({email:email}).then(function(res){
    if(btn)btn.disabled=false;
    if(res.error){showToast('Could not send code: '+res.error.message);return;}
    showToast('✅ Code sent — check your email');
    document.getElementById('sync-step-email').style.display='none';
    document.getElementById('sync-step-code').style.display='block';
  });
}
function syncVerifyCode(){
  var codeEl=document.getElementById('sync-code');
  var code=codeEl?codeEl.value.trim():'';
  if(!code){showToast('Enter the code from your email');return;}
  if(!syncClient)return;
  syncClient.auth.verifyOtp({email:pendingSyncEmail,token:code,type:'email'}).then(function(res){
    if(res.error){showToast('Incorrect or expired code');return;}
    syncState.userId=res.data.user.id;
    syncState.email=pendingSyncEmail;
    saveSyncState();
    showToast('✅ Signed in!');
    syncCheckHousehold();
  });
}
function syncCheckHousehold(){
  if(!syncClient||!syncState.userId)return;
  syncClient.from('household_members').select('household_id,role').eq('user_id',syncState.userId).then(function(res){
    if(res.data&&res.data.length){
      syncState.householdId=res.data[0].household_id;
      syncState.role=res.data[0].role;
      syncState.linked=true;
      saveSyncState();
      renderSyncUI();
      syncPullContacts();syncPullMeds();syncPullActivity();syncTouchLastActive();syncPullSubscription();
      // Restore the senior's name from the cloud if this device lost it — iOS Safari clears
      // browser storage for non-installed sites after ~7 days of disuse, which silently
      // reverted the name to the "Dorothy" placeholder. The household row is the backup.
      if(seniorName==='Dorothy'){
        syncClient.from('households').select('senior_name').eq('id',syncState.householdId).single().then(function(r2){
          if(r2.data&&r2.data.senior_name&&r2.data.senior_name!=='Dorothy')saveSeniorName(r2.data.senior_name);
        });
      }
      showToast('✅ Reconnected to your synced household');
    }else{
      var codeStep=document.getElementById('sync-step-code');if(codeStep)codeStep.style.display='none';
      var chooseStep=document.getElementById('sync-step-choose');if(chooseStep)chooseStep.style.display='block';
    }
  });
}
function syncCreateHousehold(){
  if(!syncClient||!syncState.userId){showToast('Verify your email first');return;}
  syncClient.from('households').insert({senior_name:seniorName}).select().single().then(function(res){
    if(res.error){showToast('Could not start sync: '+res.error.message);return;}
    var hh=res.data;
    syncClient.from('household_members').insert({household_id:hh.id,user_id:syncState.userId,role:'senior',display_name:seniorName}).then(function(res2){
      if(res2.error){showToast('Could not finish setup: '+res2.error.message);return;}
      syncState.householdId=hh.id;syncState.role='senior';syncState.linked=true;saveSyncState();
      renderSyncUI();
      syncPullContacts();syncPullMeds();syncPullActivity();syncTouchLastActive();syncPullSubscription();
      showToast('🎉 Sync set up! Share your invite code with a caregiver.');
      speak('Sync is set up. You can now share your invite code with a caregiver.');
    });
  });
}
function syncJoinHousehold(){
  if(!syncClient||!syncState.userId){showToast('Verify your email first');return;}
  var codeEl=document.getElementById('sync-join-code');
  var hhId=codeEl?codeEl.value.trim():'';
  if(!hhId){showToast('Enter the invite code from their phone');return;}
  syncClient.from('household_members').insert({household_id:hhId,user_id:syncState.userId,role:'caregiver'}).then(function(res){
    if(res.error){
      // The free-tier caregiver-limit trigger (schema-subscriptions.sql) raises a specific,
      // matchable message when a household already has one caregiver and isn't Premium.
      if(res.error.message&&res.error.message.indexOf('FREE_TIER_CAREGIVER_LIMIT')!==-1){
        showToast('👨‍👩‍👧 This household already has a caregiver on the free plan — Caregiver Premium unlocks more');
        speak('This household already has one caregiver connected. Caregiver Premium allows more than one.');
      }else{
        showToast('Could not join — check the code and try again');
      }
      return;
    }
    syncState.householdId=hhId;syncState.role='caregiver';syncState.linked=true;saveSyncState();
    renderSyncUI();
    syncPullContacts();syncPullMeds();syncPullActivity();syncTouchLastActive();syncPullSubscription();
    showToast('🎉 Connected! You can now see their contacts and activity.');
    speak('You are now connected and can see their contacts and activity.');
  });
}
function renderSyncUI(){
  var notLinked=document.getElementById('sync-not-linked');
  var linked=document.getElementById('sync-linked');
  if(!notLinked||!linked)return;
  if(syncState.linked){
    notLinked.style.display='none';
    linked.style.display='block';
    var lbl=document.getElementById('sync-role-label');
    if(lbl)lbl.textContent=syncState.role==='senior'?'the senior on this account':'a caregiver';
    var inviteRow=document.getElementById('sync-invite-row');
    if(inviteRow){
      if(syncState.role==='senior'){
        inviteRow.style.display='block';
        var inv=document.getElementById('sync-invite-code');if(inv)inv.value=syncState.householdId;
      }else{
        inviteRow.style.display='none';
      }
    }
  }else{
    notLinked.style.display='block';
    linked.style.display='none';
  }
}
function syncCopyInvite(){
  var inp=document.getElementById('sync-invite-code');
  if(!inp)return;
  inp.select();
  try{document.execCommand('copy');showToast('📋 Copied — send this to your caregiver');}
  catch(e){if(navigator.clipboard)navigator.clipboard.writeText(inp.value).then(()=>showToast('📋 Copied'));}
}

// ── Contacts sync — pushes/pulls the same allContacts data this app already edits locally ──
function syncPullContacts(){
  if(!syncClient||!syncState.linked)return;
  syncClient.from('contacts').select('*').eq('household_id',syncState.householdId).then(function(res){
    if(res.error||!res.data)return;
    if(res.data.length){
      allContacts=res.data.map(function(c){return {name:c.name,role:c.role||'',phone:c.phone,avatar:c.avatar||'👤',type:c.type||'fam',_syncId:c.id};});
    }
    renderContacts(currentContactFilter());
    if(typeof renderPhoneScreen==='function')renderPhoneScreen();
  });
}
function syncPushContact(contact){
  if(!syncClient||!syncState.linked)return;
  if(contact._syncId){
    syncClient.from('contacts').update({name:contact.name,role:contact.role,phone:contact.phone}).eq('id',contact._syncId).then(function(){});
  }else{
    syncClient.from('contacts').insert({household_id:syncState.householdId,name:contact.name,role:contact.role,phone:contact.phone,avatar:contact.avatar,type:contact.type}).select().single().then(function(res){
      if(res.data)contact._syncId=res.data.id;
    });
  }
}
function syncDeleteContact(contact){
  if(!syncClient||!syncState.linked||!contact._syncId)return;
  syncClient.from('contacts').delete().eq('id',contact._syncId).then(function(){});
}

// ═══ EDIT / ADD / DELETE CONTACTS ═══
var isEditingContacts=false;
var editingContactOriginalName=null;
function currentContactFilter(){var s=document.getElementById('contact-search');return s?s.value:'';}
function toggleEditContacts(){
  isEditingContacts=!isEditingContacts;
  var btn=document.getElementById('edit-contacts-btn');
  if(btn)btn.textContent=isEditingContacts?'✅ Done':'✏️ Edit';
  if(!isEditingContacts)closeEditContact();
  renderContacts(currentContactFilter());
}
function openEditContact(name){
  var c=allContacts.find(x=>x.name===name);
  if(!c)return;
  editingContactOriginalName=name;
  document.getElementById('contact-edit-title').textContent='Edit Contact';
  document.getElementById('edit-contact-name').value=c.name;
  document.getElementById('edit-contact-role').value=c.role;
  document.getElementById('edit-contact-phone').value=c.phone;
  var del=document.getElementById('delete-contact-btn');if(del)del.style.display='';
  var ed=document.getElementById('contact-edit-editor');
  ed.style.display='block';
  ed.scrollIntoView({behavior:'smooth',block:'center'});
}
function openNewContact(){
  editingContactOriginalName=null;
  document.getElementById('contact-edit-title').textContent='Add New Contact';
  document.getElementById('edit-contact-name').value='';
  document.getElementById('edit-contact-role').value='';
  document.getElementById('edit-contact-phone').value='';
  var del=document.getElementById('delete-contact-btn');if(del)del.style.display='none';
  var ed=document.getElementById('contact-edit-editor');
  ed.style.display='block';
  ed.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>document.getElementById('edit-contact-name').focus(),50);
}
function closeEditContact(){
  editingContactOriginalName=null;
  var ed=document.getElementById('contact-edit-editor');
  if(ed)ed.style.display='none';
}
function saveEditedContact(){
  var name=document.getElementById('edit-contact-name').value.trim();
  var role=document.getElementById('edit-contact-role').value.trim();
  var phone=document.getElementById('edit-contact-phone').value.trim();
  if(!name||!phone){showToast('Name and phone are required');return;}
  if(editingContactOriginalName){
    // Editing an existing contact
    var c=allContacts.find(x=>x.name===editingContactOriginalName);
    if(!c)return;
    var favIdx=favoriteContacts.indexOf(c.name);
    c.name=name;c.role=role||c.role;c.phone=phone;
    if(favIdx>=0){favoriteContacts[favIdx]=name;saveFavorites();}
    if(typeof syncPushContact==='function')syncPushContact(c);
    showToast('✅ Contact updated');
    speak(name+' updated.');
    if(typeof logEvent==='function')logEvent('contact_edited',{name:name});
  }else{
    // Adding a brand-new contact
    if(allContacts.some(x=>x.name.toLowerCase()===name.toLowerCase())){showToast('A contact named '+name+' already exists');return;}
    var newC={name:name,role:role||'Contact',phone:phone,avatar:'👤',type:'fam'};
    allContacts.push(newC);
    if(typeof syncPushContact==='function')syncPushContact(newC);
    showToast('✅ '+name+' added to Contacts');
    speak(name+' added to your contacts.');
    if(typeof logEvent==='function')logEvent('contact_added',{name:name});
  }
  closeEditContact();
  renderContacts(currentContactFilter());
  if(typeof renderPhoneScreen==='function')renderPhoneScreen();
}
function deleteEditedContact(){
  if(!editingContactOriginalName)return;
  var idx=allContacts.findIndex(x=>x.name===editingContactOriginalName);
  if(idx<0)return;
  var removed=allContacts[idx];
  allContacts.splice(idx,1);
  var favIdx=favoriteContacts.indexOf(removed.name);
  if(favIdx>=0){favoriteContacts.splice(favIdx,1);saveFavorites();}
  if(typeof syncDeleteContact==='function')syncDeleteContact(removed);
  closeEditContact();
  renderContacts(currentContactFilter());
  if(typeof renderPhoneScreen==='function')renderPhoneScreen();
  lastAction={type:'delete_contact',contact:removed,index:idx};
  showUndo('Deleted '+removed.name);
  if(typeof logEvent==='function')logEvent('contact_deleted',{name:removed.name});
}

// ════════════════════════════════════════════════════════════════
// ═══ FAMILY SCREEN ═══
// ════════════════════════════════════════════════════════════════
var familyMembers=[
  {name:'Susan Miller',rel:'Daughter · Primary Caregiver',phone:'(407) 555-0182',avatar:'👧',last:'Talked 2 hrs ago'},
  {name:'Robert Miller',rel:'Son',phone:'(407) 555-0193',avatar:'👨',last:'Talked yesterday'},
  {name:'Linda Thompson',rel:'Sister · Lives next door',phone:'(407) 555-0147',avatar:'👩',last:'Visited Sunday'},
  {name:'Mary Johnson',rel:'Niece',phone:'(407) 555-0128',avatar:'👵',last:'Talked last week'},
  {name:'Tommy Miller',rel:'Grandson · Age 12',phone:'(407) 555-7421',avatar:'👦',last:'Texted Saturday'},
];
function renderFamily(){
  var list=document.getElementById('family-list');if(!list)return;
  list.innerHTML=familyMembers.map(m=>{
    return '<div class="fam-mem">'
      +'<div class="fam-avatar">'+m.avatar+'</div>'
      +'<div class="fam-info">'
        +'<div class="fam-name">'+m.name+'</div>'
        +'<div class="fam-rel">'+m.rel+'</div>'
        +'<div class="fam-last">'+m.last+'</div>'
      +'</div>'
      +'<div class="fam-actions">'
        +'<button class="cact call" data-name="'+m.name+'" title="Voice call">'+SVG_PHONE_CALL_IN+'</button>'
        +'<button class="cact video" data-name="'+m.name+'" title="Video call">'+SVG_VIDEO+'</button>'
      +'</div></div>';
  }).join('');
  // Wire actions — full 3-state cycle: idle (lt blue) → in-use (green RING) → ended (red END) → idle
  list.querySelectorAll('.cact.call').forEach(btn=>{
    btn.onclick=()=>{
      btn.classList.remove('ended');btn.classList.add('in-use');btn.innerHTML=SVG_PHONE_RING;
      showToast('☎ Calling '+btn.dataset.name+'…');speak('Calling '+btn.dataset.name+'.');
      setTimeout(()=>{btn.classList.remove('in-use');btn.classList.add('ended');btn.innerHTML=SVG_PHONE_END;},3000);
      setTimeout(()=>{btn.classList.remove('ended');btn.innerHTML=SVG_PHONE_CALL_IN;},4500);
      if(typeof fireIft==='function')fireIft('call_started',btn.dataset.name,'family');
    };
  });
  list.querySelectorAll('.cact.video').forEach(btn=>{
    var m=familyMembers.find(x=>x.name===btn.dataset.name);
    btn.onclick=()=>startVideoCall(btn.dataset.name,m?m.phone:'');
  });
}

// ════════════════════════════════════════════════════════════════
// ═══ PHONE SCREEN — Favorites, Recent, Dial Pad, Emergency ═══
// ════════════════════════════════════════════════════════════════
// Favorites are user-selectable + persisted; limit is adjustable. Default seed below.
var FAV_KEY='totavivo_favorites_v1';
var favoriteContacts=['Susan Miller','Robert Miller','Linda Thompson','Dr. Sarah Patel'];
var favLimit=8;
var favEditMode=false;
function loadFavorites(){try{var s=TotaStorage.getItem(FAV_KEY);if(s){var d=JSON.parse(s);if(Array.isArray(d.list))favoriteContacts=d.list;if(d.limit)favLimit=d.limit;}}catch(e){}}
function saveFavorites(){try{TotaStorage.setItem(FAV_KEY,JSON.stringify({list:favoriteContacts,limit:favLimit}));}catch(e){}}
var recentCallsData=[
  {name:'Susan Miller',time:'9:14 AM today',dir:'out',duration:'4m 22s'},
  {name:'CVS Pharmacy',time:'Yesterday 3:40 PM',dir:'out',duration:'2m 15s'},
  {name:'Robert Miller',time:'Yesterday 11:08 AM',dir:'in',duration:'8m 51s'},
  {name:'Unknown (407) 555-9921',time:'May 28 · 2:11 PM',dir:'missed',duration:''},
  {name:'Dr. Sarah Patel',time:'May 26 · 10:00 AM',dir:'out',duration:'1m 02s'},
];
var dialBuffer='';
var lastDialedNumber='';

function renderPhoneScreen(){
  // Favorites
  var fav=document.getElementById('fav-grid');
  if(fav){
    fav.innerHTML=favoriteContacts.map(name=>{
      var c=allContacts.find(x=>x.name===name);
      if(!c)return '';
      var first=c.name.split(' ')[0];
      return '<div class="fav-btn" data-name="'+escAttr(c.name)+'" onclick="callContact(\''+escJs(c.name)+'\',this)">'
        +'<div class="fb-icon">'+SVG_PHONE_CALL_IN+'</div>'
        +'<div class="fb-name">'+esc(first)+'</div>'
        +'<div class="fb-role">'+esc(c.role)+'</div>'
        +'</div>';
    }).join('');
  }
  // Recent calls
  var rc=document.getElementById('recent-calls');
  if(rc){
    rc.innerHTML=recentCallsData.slice(0,8).map(call=>{
      var arrow=call.dir==='out'?'↗':call.dir==='in'?'↙':'✕';
      var dirCls=call.dir==='missed'?'missed':(call.dir==='in'?'in':'');
      return '<div class="recent-call">'
        +'<div class="rc-dir '+dirCls+'">'+arrow+'</div>'
        +'<div class="rc-info"><div class="rc-name">'+esc(call.name)+'</div><div class="rc-time">'+esc(call.time)+(call.duration?' · '+esc(call.duration):' · missed')+'</div></div>'
        +'<button class="rc-call" onclick="callContact(\''+escJs(call.name)+'\')" title="Call back">'+SVG_PHONE_CALL+'</button>'
        +'</div>';
    }).join('');
  }
  // Dial pad
  var dp=document.getElementById('dial-pad');
  if(dp&&!dp.children.length){
    var keys=['1','2','3','4','5','6','7','8','9','*','0','#'];
    dp.innerHTML=keys.map(k=>'<button class="dp-key" onclick="dialPress(\''+k+'\')">'+k+'</button>').join('');
  }
  refreshDialDisplay();
  // Empty-state hint
  if(fav&&!favoriteContacts.filter(n=>allContacts.find(c=>c.name===n)).length){
    fav.innerHTML='<div style="grid-column:1/-1;font-size:12px;color:var(--sub);text-align:center;padding:10px;line-height:1.5">No favorites yet.<br>Tap <strong style="color:var(--a2)">✏️ Choose</strong> above to pick who you call most.</div>';
  }
  if(favEditMode)renderFavEditor();
  updateAddLastDialedBtn();
}
// ── Favorites editor: user-selectable, adjustable limit, device import ──
function toggleFavEdit(){
  favEditMode=!favEditMode;
  var ed=document.getElementById('fav-editor'),btn=document.getElementById('fav-edit-btn');
  ed.style.display=favEditMode?'block':'none';
  if(btn)btn.textContent=favEditMode?'✅ Done':'✏️ Choose';
  if(favEditMode)renderFavEditor();
}
function renderFavEditor(){
  var ed=document.getElementById('fav-editor');if(!ed)return;
  var limits=[4,6,8,12];
  var html='<div style="font-size:9px;font-weight:800;color:var(--sub);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">How many favorites to keep</div>'
    +'<div style="display:flex;gap:4px;margin-bottom:8px">'+limits.map(n=>'<button onclick="setFavLimit('+n+')" class="acchip'+(favLimit===n?' sel':'')+'" style="flex:1;justify-content:center;text-align:center">'+n+'</button>').join('')+'</div>'
    +'<button class="bb gm" onclick="importPhoneFavorites()" style="margin-bottom:8px;min-height:40px;font-size:11px"><div class="f"></div><span>📥 Import Favorites From My Phone</span></button>'
    +'<div style="font-size:9px;font-weight:800;color:var(--sub);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Tap a star to add or remove ('+favoriteContacts.length+'/'+favLimit+')</div>';
  html+=allContacts.map(function(c){
    var on=favoriteContacts.includes(c.name);
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(80,140,255,.1)">'
      +'<div class="contact-avatar '+esc(c.type)+'" style="width:30px;height:30px;font-size:14px">'+esc(c.avatar)+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800;color:var(--text)">'+esc(c.name)+'</div><div style="font-size:9px;color:var(--sub)">'+esc(c.role)+'</div></div>'
      +'<button onclick="toggleFavorite(\''+escJs(c.name)+'\')" style="background:'+(on?'rgba(231,177,74,.2)':'rgba(74,144,226,.1)')+';border:1.5px solid '+(on?'var(--tv-gold)':'var(--border)')+';border-radius:8px;padding:6px 10px;font-size:16px;cursor:pointer;line-height:1">'+(on?'⭐':'☆')+'</button>'
      +'</div>';
  }).join('');
  ed.innerHTML=html;
}
function setFavLimit(n){
  favLimit=n;
  if(favoriteContacts.length>n){favoriteContacts=favoriteContacts.slice(0,n);showToast('Trimmed to your top '+n+' favorites');}
  saveFavorites();renderPhoneScreen();
  if(typeof logEvent==='function')logEvent('favorites_limit_changed',{limit:n});
}
function toggleFavorite(name){
  var i=favoriteContacts.indexOf(name);
  if(i>=0){favoriteContacts.splice(i,1);showToast('Removed '+name+' from favorites');}
  else{
    if(favoriteContacts.length>=favLimit){showToast('You have '+favLimit+' favorites — remove one first, or raise the limit above');speak('Your favorites list is full. Remove one, or raise the limit.');return;}
    favoriteContacts.push(name);showToast('⭐ Added '+name+' to favorites');
  }
  saveFavorites();renderPhoneScreen();
  if(typeof logEvent==='function')logEvent('favorite_toggled',{contact:name,active:i<0});
}
async function importPhoneFavorites(){
  if(typeof logEvent==='function')logEvent('favorites_import_requested');
  var timedOut=false;
  // Real path: Android Chrome Contacts Picker (lets the user pick contacts to mark favorite)
  if(navigator.contacts&&navigator.contacts.select){
    try{
      // A native picker that never resolves (blocked by permissions-policy, dismissed via the
      // home button instead of back, etc.) used to hang this whole button forever with zero
      // feedback — that's what "stuck on loading" turned out to be. Race it against a timeout
      // so there is always a visible outcome, then fall back to manual selection below.
      var picked=await Promise.race([
        navigator.contacts.select(['name','tel'],{multiple:true}),
        new Promise((_,rej)=>setTimeout(()=>{timedOut=true;rej(new Error('contacts_picker_timeout'));},8000))
      ]);
      var added=0;
      picked.forEach(function(p){
        var nm=(p.name&&p.name[0])||'Phone contact';
        var ph=(p.tel&&p.tel[0])||'';
        if(!allContacts.find(x=>x.name===nm))allContacts.push({name:nm,role:'From your phone',phone:ph,avatar:'👤',type:'fam'});
        if(favoriteContacts.length<favLimit&&!favoriteContacts.includes(nm)){favoriteContacts.push(nm);added++;}
      });
      saveFavorites();renderContacts('');renderPhoneScreen();
      showToast('✅ Imported '+added+' favorite'+(added===1?'':'s')+' from your phone');
      speak('I added '+added+' favorite'+(added===1?'':'s')+' from your phone.');
      return;
    }catch(e){if(typeof logEvent==='function')logEvent('favorites_import_failed',{timedOut:timedOut});/* cancelled, blocked, or timed out — fall through to manual below */}
  }
  // Fallback (iPhone Safari has no Favorites API, or the picker above timed out/failed):
  // explain + open the manual chooser so the user is never left staring at nothing.
  showToast(timedOut?'⏱️ Your phone didn\'t respond — choose favorites below instead':'On iPhone, choose your favorites below — your phone\'s Favorites list is private and can\'t be read automatically');
  speak(timedOut?'Your phone did not respond in time. Tap the stars below to choose who you call most.':'For your privacy, your phone\'s favorites list can\'t be read automatically. Tap the stars below to choose who you call most.');
  if(!favEditMode)toggleFavEdit();else renderFavEditor();
}
function dialPress(k){dialBuffer+=k;refreshDialDisplay();}
function dialClear(){dialBuffer=dialBuffer.slice(0,-1);refreshDialDisplay();}
function refreshDialDisplay(){var d=document.getElementById('dial-display');if(!d)return;d.textContent=dialBuffer||'​';}
function dialCall(){
  if(!dialBuffer){showToast('Type a number first');return;}
  var num=dialBuffer;
  showToast('☎ Calling '+num+'…');speak('Calling '+num.replace(/(\d)/g,'$1 ')+'.');
  recentCallsData.unshift({name:num,time:'Just now',dir:'out',duration:'…'});
  if(recentCallsData.length>15)recentCallsData.pop();
  if(typeof fireIft==='function')fireIft('call_started',num,'dialpad');
  lastDialedNumber=num;
  dialBuffer='';refreshDialDisplay();renderPhoneScreen();
}
function updateAddLastDialedBtn(){
  var btn=document.getElementById('add-last-dialed-btn');
  var lbl=document.getElementById('add-last-dialed-lbl');
  if(!btn||!lbl)return;
  if(!lastDialedNumber){
    btn.disabled=true;
    lbl.textContent='➕ Dial a number to add it as a contact';
    return;
  }
  var digits=lastDialedNumber.replace(/\D/g,'');
  var already=allContacts.some(c=>c.phone.replace(/\D/g,'')===digits);
  if(already){
    btn.disabled=true;
    lbl.textContent='✓ '+lastDialedNumber+' is already a contact';
  }else{
    btn.disabled=false;
    lbl.textContent='➕ Add '+lastDialedNumber+' to Contacts';
  }
}
function toggleAddLastDialedEditor(){
  var ed=document.getElementById('add-last-dialed-editor');
  if(!ed||!lastDialedNumber)return;
  var showing=ed.style.display==='block';
  ed.style.display=showing?'none':'block';
  if(!showing){
    document.getElementById('add-last-dialed-num').textContent=lastDialedNumber;
    var inp=document.getElementById('add-last-dialed-name');
    inp.value='';
    setTimeout(()=>inp.focus(),50);
  }
}
function saveLastDialedContact(){
  var name=document.getElementById('add-last-dialed-name').value.trim();
  if(!name){showToast('Please enter a name');return;}
  var newC={name:name,role:'Added from dialer',phone:lastDialedNumber,avatar:'👤',type:'fam'};
  allContacts.push(newC);
  if(typeof syncPushContact==='function')syncPushContact(newC);
  document.getElementById('add-last-dialed-editor').style.display='none';
  showToast('✅ '+name+' added to Contacts');
  speak(name+' added to your contacts.');
  if(typeof logEvent==='function')logEvent('contact_added_from_dialer',{name:name});
  renderPhoneScreen();
}

function callContact(name,btn){
  var c=allContacts.find(x=>x.name===name);
  // Full 3-state cycle on the fav tile: idle (lt blue) → calling (green) → ended (red) → idle
  if(btn){
    btn.classList.remove('ended');btn.classList.add('calling');
    var iconEl=btn.querySelector('.fb-icon');if(iconEl)iconEl.innerHTML=SVG_PHONE_RING;
    setTimeout(()=>{btn.classList.remove('calling');btn.classList.add('ended');if(iconEl)iconEl.innerHTML=SVG_PHONE_END;},3000);
    setTimeout(()=>{btn.classList.remove('ended');if(iconEl)iconEl.innerHTML=SVG_PHONE_CALL_IN;},4500);
  }
  showToast('☎ Calling '+name+'…');
  speak('Calling '+name+'.');
  recentCallsData.unshift({name,time:'Just now',dir:'out',duration:'…'});
  if(recentCallsData.length>15)recentCallsData.pop();
  if(typeof fireIft==='function')fireIft('call_started',name,c?c.phone:'');
  if(typeof logEvent==='function')logEvent('call_initiated',{contact:name,source:btn?'favorite_tile':'recent_or_other'});
}
function emergencyCall(){
  if(confirmDelay===0){doEmergencyCall();return;}
  trigConf('Call 911 Emergency Services','doEmergencyCall()');
}
function doEmergencyCall(){
  // HONEST 911: a web app cannot place or dispatch a 911 call, so we never claim it did.
  // The real, local parts fire (siren + flashing lights + vibration + location), then we show
  // a big CALL 911 button the user taps (opens the phone's own dialer). No fake "calling 911".
  if(typeof logEvent==='function')logEvent('911_initiated',{source:'manual'});
  if(typeof fireIft==='function')fireIft('emergency_911',seniorName,'manual');
  warmBeaconAudio(); // this runs inside the button-tap gesture so the siren is allowed to sound
  startEmergencyBeacon('panic');
  showPanicHelp(); // user explicitly chose 911 → go straight to the honest help buttons
  speak('The alarm is on. To reach 911, press the red Call 911 button — it opens your phone to dial. If you are safe, press I am safe.');
}

// ════════════════════════════════════════════════════════════════
// ═══ 911 BEACON — flashing Red/Yellow/Blue + siren so help can find you ═══
// Overrides presets to maximum brightness (bright full-screen flashes + wake lock)
// and maximum volume (Web Audio siren at full gain). Fully user-silenceable.
// ════════════════════════════════════════════════════════════════
var beacon={on:false,mode:'default',flashTimer:null,audioCtx:null,osc:null,gain:null,sirenTimer:null,vibTimer:null,wake:null,silenced:false,warmed:false,phase:0};
var BEACON_COLORS=['#ff0000','#ffd000','#0040ff','#ffffff']; // red, yellow, blue, white
var REDUCED_MOTION=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// Pre-warm the Web Audio siren INSIDE a real user gesture (tap/hold) so iOS Safari allows the
// sound. Without this, starting audio from the delayed hold-complete callback runs silent on iOS.
function warmBeaconAudio(){
  try{
    if(beacon.audioCtx&&beacon.osc)return; // already warm/running
    var Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
    beacon.audioCtx=new Ctx();
    if(beacon.audioCtx.state==='suspended')beacon.audioCtx.resume();
    beacon.gain=beacon.audioCtx.createGain();
    beacon.gain.gain.value=0.0; // silent until fire
    beacon.gain.connect(beacon.audioCtx.destination);
    beacon.osc=beacon.audioCtx.createOscillator();
    beacon.osc.type='sawtooth';beacon.osc.frequency.value=800;
    beacon.osc.connect(beacon.gain);beacon.osc.start();
    beacon.warmed=true;
  }catch(e){}
}
function teardownWarmAudio(){ // only when warmed but NOT actually firing (aborted hold)
  if(beacon.on)return;
  if(beacon.sirenTimer){clearInterval(beacon.sirenTimer);beacon.sirenTimer=null;}
  try{if(beacon.osc){beacon.osc.stop();beacon.osc.disconnect();}}catch(e){}
  try{if(beacon.audioCtx)beacon.audioCtx.close();}catch(e){}
  beacon.osc=null;beacon.gain=null;beacon.audioCtx=null;beacon.warmed=false;
}
function startEmergencyBeacon(mode){
  if(beacon.on)return;
  beacon.on=true;beacon.silenced=false;beacon.phase=0;beacon.mode=(mode==='panic'?'panic':'default');
  var ov=document.getElementById('beacon-ov');
  if(ov){ov.classList.toggle('panic-mode',beacon.mode==='panic');ov.classList.add('show');}
  // In panic mode remove the one-tap silent-kill ✕ so a snatch/stray tap can't instantly kill it.
  var bx=document.getElementById('beacon-x');if(bx)bx.style.display=(beacon.mode==='panic'?'none':'flex');
  var sb=document.getElementById('beacon-silence-btn');if(sb){sb.textContent='🔇 Silence the Alarm';sb.disabled=false;}
  // Flashing lights — kept under 3 flashes/sec (WCAG 2.3.1); reduced-motion = gentle 2-colour.
  var flashColors=REDUCED_MOTION?['#ff0000','#ffffff']:BEACON_COLORS;
  var flashMs=REDUCED_MOTION?650:340;
  var flash=document.getElementById('beacon-flash');
  beacon.flashTimer=setInterval(function(){
    beacon.phase=(beacon.phase+1)%flashColors.length;
    if(flash)flash.style.background=flashColors[beacon.phase];
  },flashMs);
  startBeaconSiren();
  if(navigator.vibrate){beacon.vibTimer=setInterval(function(){navigator.vibrate([400,150,400,150]);},1200);navigator.vibrate([400,150,400,150]);}
  if('wakeLock' in navigator){navigator.wakeLock.request('screen').then(function(w){beacon.wake=w;}).catch(function(){});}
  if(typeof logEvent==='function')logEvent('beacon_started',{mode:beacon.mode});
}
function startBeaconSiren(){
  try{
    if(!beacon.audioCtx||!beacon.osc)warmBeaconAudio(); // cold path (fall/911 not pre-warmed)
    if(!beacon.audioCtx||!beacon.gain||!beacon.osc)return;
    if(beacon.audioCtx.state==='suspended')beacon.audioCtx.resume();
    beacon.gain.gain.linearRampToValueAtTime(0.9,beacon.audioCtx.currentTime+0.15); // ramp to loud
    var hi=true;
    if(beacon.sirenTimer)clearInterval(beacon.sirenTimer);
    beacon.sirenTimer=setInterval(function(){
      if(!beacon.osc)return;hi=!hi;
      try{beacon.osc.frequency.setValueAtTime(hi?960:640,beacon.audioCtx.currentTime);}catch(e){}
    },550);
  }catch(e){}
}
function stopBeaconSiren(){
  if(beacon.sirenTimer){clearInterval(beacon.sirenTimer);beacon.sirenTimer=null;}
  try{if(beacon.gain&&beacon.audioCtx)beacon.gain.gain.linearRampToValueAtTime(0,beacon.audioCtx.currentTime+0.1);}catch(e){}
  setTimeout(function(){try{if(beacon.osc){beacon.osc.stop();beacon.osc.disconnect();}}catch(e){}try{if(beacon.audioCtx)beacon.audioCtx.close();}catch(e){}beacon.osc=null;beacon.gain=null;beacon.audioCtx=null;beacon.warmed=false;},200);
}
function silenceBeacon(){
  if(!beacon.on||beacon.silenced)return;
  beacon.silenced=true;
  stopBeaconSiren();
  if(beacon.vibTimer){clearInterval(beacon.vibTimer);beacon.vibTimer=null;}
  if(navigator.vibrate)navigator.vibrate(0);
  var sb=document.getElementById('beacon-silence-btn');if(sb){sb.textContent='🔇 Sound Off — lights still flashing';sb.disabled=true;}
  var sub=document.querySelector('#beacon-ov .beacon-sub');if(sub)sub.innerHTML='Sound is off — <b>lights keep flashing</b><br>so people can still find you.';
  showToast('🔇 Alarm silenced — lights still flashing');
  if(typeof logEvent==='function')logEvent('beacon_silenced');
}
function stopBeacon(){
  beacon.on=false;
  if(beacon.flashTimer){clearInterval(beacon.flashTimer);beacon.flashTimer=null;}
  stopBeaconSiren();
  if(beacon.vibTimer){clearInterval(beacon.vibTimer);beacon.vibTimer=null;}
  if(navigator.vibrate)navigator.vibrate(0);
  if(beacon.wake){try{beacon.wake.release();}catch(e){}beacon.wake=null;}
  if(typeof panic!=='undefined'&&panic.countTimer){clearInterval(panic.countTimer);panic.countTimer=null;}
  if(typeof panic!=='undefined'&&panic.camTimer){clearInterval(panic.camTimer);panic.camTimer=null;}
  var ov=document.getElementById('beacon-ov');if(ov){ov.classList.remove('show');ov.classList.remove('panic-mode');}
  var bx=document.getElementById('beacon-x');if(bx)bx.style.display='flex';
  var bp=document.getElementById('beacon-panic');if(bp)bp.innerHTML='';
  var sub=document.querySelector('#beacon-ov .beacon-sub');if(sub)sub.innerHTML='Loud siren &amp; flashing lights are ON<br>so people can find you fast.<br>Stay where you are if you can.';
  beacon.mode='default';
  showToast('Alarm off — glad you\'re safe 💚');
  if(typeof logEvent==='function')logEvent('beacon_stopped');
}

// ════════════════════════════════════════════════════════════════
// ═══ VIVO GUARDIAN — personal panic/duress alarm (SEPARATE from fall detection) ═══
// Arm ("cock") from the logo → silent panel. Press-and-HOLD ("trigger") → instant real
// siren/lights/vibrate + 15s cancel window → HONEST user-tapped 911/contacts. Never auto-dials.
// ════════════════════════════════════════════════════════════════
var PANIC_CANCEL_SEC=15; // ONE source of truth: caution text + countdown both read this
var PANIC_HOLD_MS=1500;
var panic={holding:false,fired:false,practice:false,holdStart:0,fillRAF:null,countTimer:null,autoClose:null,wake:null};

function guardianContacts(){
  var list=(typeof emergencyContacts!=='undefined'?emergencyContacts:[]);
  return list.map(function(c){
    var name=(typeof c==='string')?c:((c&&c.name)||'');
    var num=(c&&c.number)?c.number:'';
    return {name:name,number:num};
  }).filter(function(c){return c.name;});
}
function guardianLocationLink(){
  var L=(typeof sensorState!=='undefined'&&sensorState&&sensorState.location)?sensorState.location:null;
  if(!L||!L.lat||!L.lng)return '';
  return 'https://maps.google.com/?q='+encodeURIComponent(L.lat+','+L.lng);
}
function renderGuardianCaution(){
  var el=document.getElementById('panic-caution');if(!el)return;
  var canBuzz=!!navigator.vibrate;
  el.innerHTML=
    '<h4>🛡️ Your Personal Safety Alarm — please read</h4>'+
    '<p>Use this when you feel unsafe or threatened and need to get attention and reach help fast — walking to your car, waiting alone, or if someone frightens you.</p>'+
    '<p><b>When you sound it, this phone will right away:</b></p>'+
    '<ul>'+
      '<li>🔊 Sound a loud siren <span style="color:#9fc4dd">(as loud as your phone volume allows)</span></li>'+
      '<li>🚨 Flash bright red, yellow &amp; blue lights</li>'+
      '<li>'+(canBuzz?'📳 Buzz your phone':'📳 <span style="color:#9fc4dd">This phone can\'t buzz — the siren &amp; lights still work</span>')+'</li>'+
      '<li>💡 Keep your screen lit so people can find you</li>'+
    '</ul>'+
    '<p style="color:#9fc4dd">The siren, lights and buzzing work even with no signal.</p>'+
    '<p><b>Please know:</b> TotaVivo <b>cannot secretly call 911</b> for you — it opens your phone\'s dialer so you (or someone near you) can press Call, and connecting depends on your phone and signal. No operator is watching over you. This is a personal-safety helper, <b>not</b> a monitored medical-alert service or a medical device. Automatic dialing and a 24/7 team that sends help are coming in the App Store version.</p>'+
    '<p style="color:#9fc4dd">If it goes off by mistake, you have <b>'+PANIC_CANCEL_SEC+' seconds</b> to press <b>I\'m Safe</b> — and you can stop it any time. New to this? Tap <b>Try it (Practice)</b> — nothing real happens.</p>';
}
function renderGuardianLoadout(){
  var el=document.getElementById('panic-loadout');if(!el)return;
  var contacts=guardianContacts();var hasLoc=!!guardianLocationLink();var canBuzz=!!navigator.vibrate;
  var html='';
  if(contacts.length){
    contacts.forEach(function(c){
      var has=!!c.number;
      html+='<div class="panic-row"><span class="pr-ic">📞</span><span>'+esc(c.name)+'</span>'+
            '<span class="panic-chip '+(has?'ok':'no')+'">'+(has?esc(c.number):'No number yet')+'</span></div>';
    });
  }else{
    html+='<div class="panic-row"><span class="pr-ic">📞</span><span>No emergency contacts set yet</span></div>';
  }
  html+='<div class="panic-row"><span class="pr-ic">📍</span><span>'+(hasLoc?'Location ready — your spot can be shared':'Location off — turn it on so people can find you')+'</span><span class="panic-chip '+(hasLoc?'ok':'no')+'">'+(hasLoc?'ON':'OFF')+'</span></div>';
  html+='<div class="panic-row"><span class="pr-ic">📳</span><span>'+(canBuzz?'Your phone will buzz':'This phone can\'t buzz (siren &amp; lights still work)')+'</span></div>';
  html+='<div class="panic-row"><span class="pr-ic">▶️</span><span>Siren + lights start <b>immediately</b> &rarr; <b>'+PANIC_CANCEL_SEC+' seconds</b> to press I\'m Safe &rarr; then big buttons to call 911 and your family.</span></div>';
  el.innerHTML=html;
}
function openGuardian(){
  var ov=document.getElementById('panic-ov');if(!ov)return;
  panic.fired=false;panic.holding=false;
  renderGuardianCaution();renderGuardianLoadout();resetPanicFireButton();
  ov.classList.add('show');ov.scrollTop=0;
  if('wakeLock' in navigator){navigator.wakeLock.request('screen').then(function(w){panic.wake=w;}).catch(function(){});}
  speak('Safety alarm ready. Press and hold the big red button to sound the alarm, or tap Try it to practice.');
  if(typeof logEvent==='function')logEvent('panic_armed');
  armPanicAutoClose();
}
function closeGuardian(){
  var ov=document.getElementById('panic-ov');if(ov)ov.classList.remove('show');
  cancelPanicHold();
  if(panic.autoClose){clearTimeout(panic.autoClose);panic.autoClose=null;}
  if(panic.wake){try{panic.wake.release();}catch(e){}panic.wake=null;}
}
function armPanicAutoClose(){
  if(panic.autoClose)clearTimeout(panic.autoClose);
  panic.autoClose=setTimeout(function(){
    var ov=document.getElementById('panic-ov');
    if(ov&&ov.classList.contains('show')&&!beacon.on)closeGuardian();
  },90000);
}
function resetPanicFireButton(){
  var fill=document.getElementById('panic-fill');if(fill)fill.style.width='0%';
  var lbl=document.getElementById('panic-fire-label');if(lbl)lbl.innerHTML='🛡️ Press &amp; HOLD to sound the alarm';
}
function onPanicPointerDown(e){
  if(panic.fired)return;
  if(panic.holding){cancelPanicHold();return;} // a 2nd finger (palm/pocket mash) aborts
  warmBeaconAudio(); // create+resume audio in this real gesture so the siren can sound on iOS
  panic.holding=true;panic.holdStart=Date.now();
  var btn=document.getElementById('panic-fire');if(btn){try{btn.setPointerCapture(e.pointerId);}catch(_){}}
  var lbl=document.getElementById('panic-fire-label');if(lbl)lbl.textContent='KEEP HOLDING…';
  if(navigator.vibrate)navigator.vibrate(25);
  var fill=document.getElementById('panic-fill');
  function step(){
    if(!panic.holding)return;
    var pct=Math.min(100,(Date.now()-panic.holdStart)/PANIC_HOLD_MS*100);
    if(fill)fill.style.width=pct+'%';
    if(pct>=100){panic.holding=false;fireGuardian(false);return;}
    panic.fillRAF=requestAnimationFrame(step);
  }
  panic.fillRAF=requestAnimationFrame(step);
  armPanicAutoClose();
  if(e.cancelable)e.preventDefault();
}
function cancelPanicHold(){
  panic.holding=false;
  if(panic.fillRAF){cancelAnimationFrame(panic.fillRAF);panic.fillRAF=null;}
  resetPanicFireButton();
  if(!panic.fired)teardownWarmAudio();
}
function onPanicPointerUp(){ if(!panic.fired&&panic.holding)cancelPanicHold(); }
function fireGuardian(practice){
  if(panic.fired)return;
  panic.fired=true;panic.practice=!!practice;panic.holding=false;
  if(panic.fillRAF){cancelAnimationFrame(panic.fillRAF);panic.fillRAF=null;}
  if(panic.autoClose){clearTimeout(panic.autoClose);panic.autoClose=null;}
  var ov=document.getElementById('panic-ov');if(ov)ov.classList.remove('show'); // hide arm panel so escalation shows
  if(practice)startPanicPractice(); else soundGuardianAlarm();
  if(typeof logEvent==='function')logEvent('panic_fired',{practice:!!practice});
}
function soundGuardianAlarm(){
  startEmergencyBeacon('panic'); // instant real siren + lights + vibrate (uses the warmed audio)
  try{ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(function(pos){
    if(typeof sensorState!=='undefined'&&sensorState) sensorState.location={lat:pos.coords.latitude.toFixed(5),lng:pos.coords.longitude.toFixed(5),acc:Math.round(pos.coords.accuracy)};
  },function(){},{enableHighAccuracy:true,timeout:8000,maximumAge:30000}); }catch(_){}
  showPanicCountdown();
  speak('The alarm is on. If this was a mistake, press I am safe. If you are in danger, press Call 911 to reach help yourself.');
}
function showPanicCountdown(){
  var el=document.getElementById('beacon-panic');if(!el)return;
  var n=PANIC_CANCEL_SEC;
  el.innerHTML=
    '<button class="bp-safe" onclick="panicImSafe()">✅ I\'M SAFE<span class="bps-sub">Tap to stop everything</span></button>'+
    '<div class="bp-count" id="bp-count">Your help buttons appear in '+n+'s — press I\'m Safe if this was a mistake.</div>'+
    '<button class="bp-btn silence" onclick="silenceBeacon()">🔇 Silence (lights keep flashing)</button>'+
    '<button class="bp-btn call911" onclick="showPanicHelp()">📞 Call 911 now</button>';
  if(panic.countTimer)clearInterval(panic.countTimer);
  panic.countTimer=setInterval(function(){
    n--;var c=document.getElementById('bp-count');
    if(n<=0){clearInterval(panic.countTimer);panic.countTimer=null;showPanicHelp();return;}
    if(c)c.textContent='Your help buttons appear in '+n+'s — press I\'m Safe if this was a mistake.';
  },1000);
}
function showPanicHelp(){
  if(panic.countTimer){clearInterval(panic.countTimer);panic.countTimer=null;}
  var el=document.getElementById('beacon-panic');if(!el)return;
  var contacts=guardianContacts();var loc=guardianLocationLink();
  var html='<button class="bp-safe" onclick="panicImSafe()">✅ I\'M SAFE<span class="bps-sub">Tap to stop everything</span></button>';
  html+='<a class="bp-btn call911" href="tel:911" onclick="if(typeof logEvent===\'function\')logEvent(\'panic_911_tapped\')" style="display:flex;align-items:center;justify-content:center;text-decoration:none">📞 CALL 911</a>';
  html+='<div class="bp-cap">Tap to call 911 — this opens your phone\'s dialer. You press the green Call button. Connecting depends on your phone &amp; signal.</div>';
  contacts.forEach(function(c){
    if(c.number){
      var body='I need help. '+(loc?('Here is where I am: '+loc):'My location is not available right now.');
      var sms='sms:'+c.number+'?&body='+encodeURIComponent(body);
      html+='<button class="bp-btn contact-text" onclick="location.href=\''+escJs(sms)+'\'">💬 Text '+esc(c.name)+' my location</button>';
      html+='<button class="bp-btn contact-call" onclick="location.href=\'tel:'+escJs(c.number)+'\'">📞 Call '+esc(c.name)+'</button>';
    }else{
      html+='<button class="bp-btn contact-text" disabled>💬 '+esc(c.name)+' — add a number to enable</button>';
    }
  });
  html+='<div class="bp-honest">On this demo, Guardian turns on the siren, lights and location and gives you one-tap buttons to call 911 and text your family <b>that you press yourself</b>. Automatic dialing and a 24/7 monitoring team that sends responders for you exist only in the App Store / monitored version.</div>';
  el.innerHTML=html;
  speak('If you need help, press the red Call 911 button to call for help yourself.');
}
function panicImSafe(){
  if(panic.countTimer){clearInterval(panic.countTimer);panic.countTimer=null;}
  panic.fired=false;
  stopBeacon();
  if(typeof logEvent==='function')logEvent('panic_canceled');
}
function startPanicPractice(){
  var ovB=document.getElementById('beacon-ov');beacon.mode='panic';
  if(ovB){ovB.classList.add('panic-mode');ovB.classList.add('show');}
  var bx=document.getElementById('beacon-x');if(bx)bx.style.display='none';
  var flash=document.getElementById('beacon-flash');if(flash)flash.style.background='#0b2a3a'; // no strobe in practice
  var el=document.getElementById('beacon-panic');var n=PANIC_CANCEL_SEC;
  el.innerHTML='<div class="panic-practice-wm">PRACTICE</div>'+
    '<button class="bp-safe" onclick="panicPracticeEnd()">✅ I\'M SAFE<span class="bps-sub">(practice — tap to finish)</span></button>'+
    '<div class="bp-count" id="bp-count">PRACTICE — the real alarm would be sounding now. Help buttons in '+n+'s.</div>'+
    '<button class="bp-btn call911" onclick="panicPracticeEnd()">Finish practice</button>';
  speak('This is practice. Nothing real happens. In a real emergency the siren and lights would be on now.');
  if(panic.countTimer)clearInterval(panic.countTimer);
  panic.countTimer=setInterval(function(){
    n--;var c=document.getElementById('bp-count');
    if(n<=0){clearInterval(panic.countTimer);panic.countTimer=null;panicPracticeEnd();return;}
    if(c)c.textContent='PRACTICE — the real alarm would be sounding now. Help buttons in '+n+'s.';
  },1000);
}
function panicPracticeEnd(){
  if(panic.countTimer){clearInterval(panic.countTimer);panic.countTimer=null;}
  panic.fired=false;panic.practice=false;beacon.mode='default';
  var ovB=document.getElementById('beacon-ov');if(ovB){ovB.classList.remove('show');ovB.classList.remove('panic-mode');}
  var bp=document.getElementById('beacon-panic');if(bp)bp.innerHTML='';
  var bx=document.getElementById('beacon-x');if(bx)bx.style.display='flex';
  showToast('👍 Practice done — that\'s how it works');
}
function joinGuardianWaitlist(){
  // Honest interest capture — the free alarm is NOT gated; this only registers interest in the
  // future paid monitoring/auto-notify tier.
  try{TotaStorage.setItem('totavivo_guardian_premium_waitlist','1');}catch(e){}
  var b=document.getElementById('guardian-premium-btn');
  if(b){b.textContent='✅ You\'re on the list — we\'ll tell you when it\'s ready';b.disabled=true;b.style.opacity='.75';}
  showToast('🔔 Added to the Premium Safety waitlist');
  speak('Thank you. We will let you know when Premium Safety monitoring is ready. The alarm stays free.');
  if(typeof logEvent==='function')logEvent('guardian_premium_waitlist');
}
// Wire the press-and-hold trigger (pointer events) + an accessible keyboard fallback
(function wireGuardianFire(){
  var btn=document.getElementById('panic-fire');if(!btn)return;
  btn.addEventListener('pointerdown',onPanicPointerDown);
  btn.addEventListener('pointerup',onPanicPointerUp);
  btn.addEventListener('pointercancel',onPanicPointerUp);
  btn.addEventListener('pointerleave',onPanicPointerUp);
  btn.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();
      if(window.confirm('Sound the safety alarm now?'))fireGuardian(false);
    }
  });
})();

// ════════════════════════════════════════════════════════════════
// ═══ EARN — rewards for everyday phone use ═══
// ════════════════════════════════════════════════════════════════
var EARN_KEY='totavivo_earn_v1';
// lifetime + lifetimeWithdrawn never reset (balance compiles until cashed out); today/week reset by date.
var earnState={balance:0,today:0,week:0,lifetime:0,lifetimeWithdrawn:0,lastCheckIn:null,lastResetDay:null,lastWeekKey:null,streak:0,passive:{data:false,lockscreen:false,cashback:true,location:false},history:[],tasksDone:{}};
var earnPassiveTimer=null;

function loadEarn(){try{var s=TotaStorage.getItem(EARN_KEY);if(s){var d=JSON.parse(s);Object.assign(earnState,d);}}catch(e){}
  // Migration/guard: ensure new fields exist and money is never lost on update
  if(typeof earnState.lifetimeWithdrawn!=='number')earnState.lifetimeWithdrawn=0;
  if(typeof earnState.lifetime!=='number')earnState.lifetime=0;
  if(!Array.isArray(earnState.history))earnState.history=[];
}
function saveEarn(){try{TotaStorage.setItem(EARN_KEY,JSON.stringify(earnState));}catch(e){}}
function todayKey(){var d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
function weekKey(){var d=new Date();var on=new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7));return on.getFullYear()+'-W'+Math.ceil(((on-new Date(on.getFullYear(),0,1))/86400000+1)/7);}
function isDailyCheckedIn(){return earnState.lastCheckIn===todayKey();}

function renderEarn(){
  // Daily reset (today counter) — never touches balance/lifetime
  if(earnState.lastResetDay!==todayKey()){
    earnState.today=0;earnState.lastResetDay=todayKey();
    // New day → drop yesterday's per-task completion flags (prevents unbounded growth)
    var sfx='_'+todayKey();
    Object.keys(earnState.tasksDone||{}).forEach(function(k){if(k.slice(-sfx.length)!==sfx)delete earnState.tasksDone[k];});
    saveEarn();
  }
  // Weekly reset (this-week counter)
  if(earnState.lastWeekKey!==weekKey()){earnState.week=0;earnState.lastWeekKey=weekKey();saveEarn();}
  var be=document.getElementById('earn-balance');if(be)be.textContent='$'+earnState.balance.toFixed(2);
  var et=document.getElementById('earn-today');if(et)et.textContent='$'+earnState.today.toFixed(2);
  var ew=document.getElementById('earn-week');if(ew)ew.textContent='$'+earnState.week.toFixed(2);
  // Statement totals
  var se=document.getElementById('stmt-earned');if(se)se.textContent='$'+earnState.lifetime.toFixed(2);
  var sw=document.getElementById('stmt-withdrawn');if(sw)sw.textContent='$'+earnState.lifetimeWithdrawn.toFixed(2);
  var sa=document.getElementById('stmt-available');if(sa)sa.textContent='$'+earnState.balance.toFixed(2);
  if(typeof renderSteps==='function')renderSteps();
  if(document.getElementById('earn-statement')&&document.getElementById('earn-statement').style.display!=='none')renderEarnStatement();
  // Cashout button
  var co=document.getElementById('cashout-btn'),col=document.getElementById('cashout-lbl');
  if(co&&col){
    if(earnState.balance>=5){col.textContent='💳 Cash Out $'+earnState.balance.toFixed(2)+' to Chase';co.disabled=false;}
    else{col.textContent='💳 Cash Out (need $5 · have $'+earnState.balance.toFixed(2)+')';co.disabled=true;}
  }
  // Streak
  var sr=document.getElementById('streak-row');
  if(sr){
    var dayLbl=['Mo','Tu','We','Th','Fr','Sa','Su'];
    var todayIdx=(new Date().getDay()+6)%7;
    sr.innerHTML=dayLbl.map((d,i)=>{
      var isPast=i<todayIdx, isToday=i===todayIdx;
      var done=(isPast&&earnState.streak>0)||(isToday&&isDailyCheckedIn());
      var pay=i===6?'$1.00':'$0.25';
      return '<div class="streak-day'+(done?' done':'')+(isToday?' today':'')+'">'
        +'<div class="sd-lbl">'+d+'</div>'
        +'<div class="sd-icon">'+(done?'✓':(isToday?'★':'·'))+'</div>'
        +'<div class="sd-pay">'+pay+'</div></div>';
    }).join('');
  }
  // History
  var h=document.getElementById('earn-history');
  if(h){
    if(!earnState.history.length)h.innerHTML='<div style="font-style:italic">No earnings yet — try a quick task above!</div>';
    else h.innerHTML=earnState.history.slice(0,20).map(e=>{
      var sign=e.amt<0?'-':'+';
      var color=e.amt<0?'var(--red)':'var(--green)';
      return '<div>'+e.time+' · <span style="color:'+color+';font-weight:800">'+sign+'$'+Math.abs(e.amt).toFixed(2)+'</span> · '+e.desc+'</div>';
    }).join('');
  }
  // Check-in button
  var ci=document.getElementById('checkin-btn');
  if(ci){
    var sp=ci.querySelector('span');
    if(isDailyCheckedIn()){if(sp)sp.textContent='✅ Checked in today — come back tomorrow';ci.disabled=true;}
    else{if(sp)sp.textContent='✨ Check In Today — Earn $0.25';ci.disabled=false;}
  }
  // Sync passive toggles to saved state
  document.querySelectorAll('[data-passive]').forEach(tog=>{
    var p=tog.dataset.passive;
    if(earnState.passive[p])tog.classList.add('on');else tog.classList.remove('on');
  });
  // Mark already-done tasks
  document.querySelectorAll('.earn-task').forEach(t=>{
    var oc=t.getAttribute('onclick')||'';
    var m=oc.match(/doTask\('([^']+)'/);
    if(m&&earnState.tasksDone[m[1]+'_'+todayKey()])t.classList.add('done');
    else t.classList.remove('done');
  });
}

function addEarn(amt,desc){
  earnState.balance+=amt;earnState.today+=amt;earnState.week+=amt;earnState.lifetime+=amt;
  earnState.history.unshift({ts:Date.now(),date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),amt:+amt.toFixed(2),desc,kind:'earn'});
  if(earnState.history.length>200)earnState.history.length=200;
  saveEarn();renderEarn();
  if(typeof fireIft==='function')fireIft('earn_credited',desc,amt.toFixed(2));
}

function dailyCheckIn(){
  if(isDailyCheckedIn()){showToast('Already checked in today');return;}
  earnState.lastCheckIn=todayKey();earnState.streak++;
  var bonus=earnState.streak>=7?1.00:0.25;
  addEarn(bonus,'Daily check-in · streak '+earnState.streak);
  speak('Daily check-in complete! You earned '+(bonus===1?'one dollar':(bonus*100).toFixed(0)+' cents')+'.');
  showToast('✨ +$'+bonus.toFixed(2)+' for checking in!');
  if(typeof logEvent==='function')logEvent('earn_check_in',{streak:earnState.streak,bonus});
}

function doTask(kind,amt,el){
  if(earnState.tasksDone[kind+'_'+todayKey()]){showToast('Already done today — try again tomorrow');return;}
  // Steps can't be claimed by tapping — it only pays out for real, once the actual step count hits the goal.
  // (addStep() already auto-credits this the moment the goal is reached; this is just a fallback + guard.)
  if(kind==='steps'){
    var goal=(typeof stepState!=='undefined')?stepState.goal:1000;
    var have=(typeof stepState!=='undefined')?stepState.steps:0;
    if(have<goal){
      var remaining=goal-have;
      showToast('👟 '+remaining.toLocaleString()+' more steps to go — turn on Sensors → Enable Motion to track them, this credits itself automatically');
      speak('You have '+remaining+' steps to go. This credits automatically once you reach your goal — enable motion sensors to track them.');
      return;
    }
  }
  earnState.tasksDone[kind+'_'+todayKey()]=true;saveEarn();
  if(el)el.classList.add('done');
  var descs={survey:'Survey completed',music:'Sponsored song played',steps:'1,000 step goal reached',ad:'30-second ad viewed',quiz:'Brain quiz completed',referral:'Friend referred ('+referralCode()+')',
    ai_voice:'Voice sample recorded for AI',ai_rate:'Rated two AI answers',ai_write:'Wrote an answer for AI training',ai_image:'Described a picture for AI',ai_check:'Checked an AI answer'};
  if(kind.indexOf('ai_')===0){
    var aiStart={ai_voice:'Reading a sentence aloud for speech AI',ai_rate:'Comparing two AI answers',ai_write:'Writing your answer',ai_image:'Describing a picture',ai_check:'Checking an AI answer'}[kind]||'AI training task';
    showToast('🧠 '+aiStart+'…');
    speak(aiStart+'. Your feedback helps train AI. Please wait.');
    setTimeout(()=>{addEarn(amt,descs[kind]);speak('Thank you! Your contribution earned '+(amt*100).toFixed(0)+' cents.');},1800);
  }else if(kind==='survey'||kind==='ad'||kind==='quiz'){
    showToast('▶ Starting '+descs[kind].toLowerCase()+'…');
    speak('Starting '+descs[kind].toLowerCase()+'. Please wait.');
    setTimeout(()=>{addEarn(amt,descs[kind]);speak('Task complete! You earned '+(amt*100).toFixed(0)+' cents.');},1800);
  }else if(kind==='referral'){
    var rcode=referralCode();
    showToast('📲 Share code '+rcode+' — earn $5 when they sign up');
    speak('Your referral code '+rcode+' has been shared. You earn 5 dollars when a friend signs up.');
    addEarn(amt,descs[kind]);
  }else{
    addEarn(amt,descs[kind]);
    speak('You earned '+(amt*100).toFixed(0)+' cents for '+descs[kind].toLowerCase()+'.');
  }
}

function togglePassive(el,kind,dailyAmt){
  el.classList.toggle('on');
  earnState.passive[kind]=el.classList.contains('on');saveEarn();
  if(earnState.passive[kind]){
    showToast('✓ '+kind+' enabled — you\'ll earn ~$'+dailyAmt.toFixed(2)+'/day');
    // Tiny instant credit so the toggle feels alive (1 hour\'s worth)
    if(dailyAmt>0)setTimeout(()=>{if(earnState.passive[kind])addEarn(+(dailyAmt/24).toFixed(2),kind+' passive earnings');},2000);
  }else{
    showToast('✕ '+kind+' disabled');
  }
}

function cashout(){
  if(earnState.balance<5){showToast('Need at least $5 to cash out');return;}
  var amt=earnState.balance;
  trigConf('Cash out $'+amt.toFixed(2)+' to Chase','doCashout('+amt+')');
}
function doCashout(amt){
  earnState.balance=0;
  earnState.lifetimeWithdrawn+=amt;
  earnState.history.unshift({ts:Date.now(),date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),amt:-+amt.toFixed(2),desc:'CASH OUT to Chase ...4521',kind:'withdraw',ref:'TV'+Date.now().toString(36).toUpperCase()});
  if(earnState.history.length>200)earnState.history.length=200;
  saveEarn();renderEarn();
  speak('Cashed out '+amt.toFixed(2)+' dollars to your Chase account. Should arrive within 1 to 3 business days. A record has been saved to your statement.');
  showToast('✅ $'+amt.toFixed(2)+' on the way to Chase — recorded in your statement!');
  if(typeof fireIft==='function')fireIft('earn_cashout','Chase',amt.toFixed(2));
  if(typeof logEvent==='function')logEvent('earn_cashout',{amount:amt,account:'Chase'});
}

// ── Earnings & Withdrawals statement (ledger with running balance) ──
function toggleEarnStatement(){
  var s=document.getElementById('earn-statement'),a=document.getElementById('earn-statement-actions'),b=document.getElementById('earn-stmt-btn');
  var open=s.style.display==='none';
  s.style.display=open?'block':'none';
  a.style.display=open?'flex':'none';
  if(b)b.textContent=open?'▲ Hide':'📋 View Full';
  if(open)renderEarnStatement();
}
function earnLedger(){
  // Oldest→newest with running balance
  var rows=earnState.history.slice().sort((a,b)=>(a.ts||0)-(b.ts||0));
  var run=0;
  return rows.map(function(r){run+=r.amt;return Object.assign({},r,{running:run});});
}
function renderEarnStatement(){
  var el=document.getElementById('earn-statement');if(!el)return;
  var ledger=earnLedger().reverse(); // newest first for display
  if(!ledger.length){el.innerHTML='<div style="font-size:11px;color:var(--sub);font-style:italic;padding:6px">No transactions yet.</div>';return;}
  el.innerHTML='<div style="max-height:220px;overflow-y:auto;background:rgba(0,0,0,.15);border-radius:9px;padding:7px">'
    +ledger.map(function(r){
      var pos=r.amt>=0;
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;padding:5px 2px;border-bottom:1px solid rgba(80,140,255,.12)">'
        +'<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:700;color:var(--text)">'+(pos?'➕ ':'➖ ')+r.desc+'</div>'
        +'<div style="font-size:9px;color:var(--sub)">'+(r.date||'')+' '+(r.time||'')+(r.ref?' · '+r.ref:'')+'</div></div>'
        +'<div style="text-align:right;flex-shrink:0"><div style="font-size:12px;font-weight:900;color:'+(pos?'var(--green)':'var(--a2)')+'">'+(pos?'+':'')+'$'+Math.abs(r.amt).toFixed(2)+'</div>'
        +'<div style="font-size:9px;color:var(--sub)">bal $'+r.running.toFixed(2)+'</div></div>'
        +'</div>';
    }).join('')+'</div>';
}
function exportEarnings(){
  var ledger=earnLedger();
  var lines=[['Date','Time','Type','Description','Amount','Running Balance','Reference']];
  ledger.forEach(function(r){lines.push([r.date||'',r.time||'',r.kind||(r.amt>=0?'earn':'withdraw'),'"'+String(r.desc).replace(/"/g,'""')+'"',r.amt.toFixed(2),r.running.toFixed(2),r.ref||'']);});
  lines.push([]);
  lines.push(['','','','TOTAL EARNED',earnState.lifetime.toFixed(2)]);
  lines.push(['','','','TOTAL WITHDRAWN',earnState.lifetimeWithdrawn.toFixed(2)]);
  lines.push(['','','','AVAILABLE BALANCE',earnState.balance.toFixed(2)]);
  var csv=lines.map(r=>r.join(',')).join('\n');
  var blob=new Blob([csv],{type:'text/csv'});var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='totavivo-earnings-'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  showToast('📥 Earnings statement exported');
  if(typeof logEvent==='function')logEvent('earnings_exported',{rows:ledger.length});
}
function emailEarningsToCaregiver(){
  var subj=encodeURIComponent('TotaVivo Earnings Statement — '+new Date().toLocaleDateString());
  var ledger=earnLedger().reverse().slice(0,40);
  var body=encodeURIComponent('Hi Susan,\n\nHere is the TotaVivo earnings summary:\n\n'
    +'Total earned: $'+earnState.lifetime.toFixed(2)+'\n'
    +'Total withdrawn: $'+earnState.lifetimeWithdrawn.toFixed(2)+'\n'
    +'Available balance: $'+earnState.balance.toFixed(2)+'\n\nRecent activity:\n'
    +ledger.map(r=>(r.date||'')+' '+(r.amt>=0?'+':'')+'$'+Math.abs(r.amt).toFixed(2)+' — '+r.desc).join('\n'));
  window.location.href='mailto:susan@example.com?subject='+subj+'&body='+body;
  if(typeof logEvent==='function')logEvent('earnings_emailed_caregiver');
}

function earnCashbackOnBill(rawAmt){
  if(!earnState.passive.cashback)return;
  var n=parseFloat(String(rawAmt).replace(/[^0-9.]/g,''));
  if(!n||isNaN(n))return;
  var cb=Math.round(n*0.02*100)/100;
  if(cb>0)setTimeout(()=>addEarn(cb,'2% cashback on $'+n.toFixed(2)+' bill'),900);
}

// ════════════════════════════════════════════════════════════════
// ═══ STEP COUNTER — daily pedometer via accelerometer ═══
// Counts steps from the same motion sensor used for fall detection.
// Persists per-day; feeds the "Walk 1,000 steps" earn task; shows on Home + Sensors.
// ════════════════════════════════════════════════════════════════
var STEP_KEY='totavivo_steps_v1';
var stepState={day:null,steps:0,goal:1000,best:0};
function loadSteps(){try{var s=TotaStorage.getItem(STEP_KEY);if(s)Object.assign(stepState,JSON.parse(s));}catch(e){}
  if(stepState.day!==todayKey()){stepState.day=todayKey();stepState.steps=0;saveSteps();}
}
function saveSteps(){try{TotaStorage.setItem(STEP_KEY,JSON.stringify(stepState));}catch(e){}}
function addStep(n){
  n=n||1;
  if(stepState.day!==todayKey()){stepState.day=todayKey();stepState.steps=0;}
  stepState.steps+=n;
  if(stepState.steps>stepState.best)stepState.best=stepState.steps;
  if(stepState.steps%20<n)saveSteps(); // throttle writes
  // Auto-complete the daily step earn task once the goal is reached
  if(stepState.steps>=stepState.goal && typeof earnState!=='undefined' && !earnState.tasksDone['steps_'+todayKey()]){
    earnState.tasksDone['steps_'+todayKey()]=true;saveSteps();saveEarn(); // persist the flag to EARN_KEY too, so it can't re-credit on reload
    if(typeof addEarn==='function')addEarn(0.15,'1,000 step goal reached');
    if(typeof logEvent==='function')logEvent('steps_goal_reached',{steps:stepState.steps});
    speak('Great job, '+seniorName+'! You reached 1,000 steps today and earned 15 cents.');
    showToast('🎉 1,000 steps! +$0.15 earned');
  }
  renderSteps();
}
function renderSteps(){
  var pct=Math.min(100,Math.round(stepState.steps/stepState.goal*100));
  // Home card
  var hs=document.getElementById('home-steps-num');if(hs)hs.textContent=stepState.steps.toLocaleString();
  var hb=document.getElementById('home-steps-bar');if(hb)hb.style.width=pct+'%';
  var hp=document.getElementById('home-steps-pct');if(hp)hp.textContent=pct+'% of '+stepState.goal.toLocaleString()+' goal';
  // Sensors card
  var ss=document.getElementById('sensor-steps');if(ss)ss.innerHTML='<strong style="color:var(--green);font-size:18px">👟 '+stepState.steps.toLocaleString()+'</strong> steps today <span style="color:var(--sub)">· goal '+stepState.goal.toLocaleString()+' · best '+stepState.best.toLocaleString()+'</span>';
  // Earn task live description
  var ed=document.getElementById('earn-steps-desc');
  if(ed){
    if(earnState&&earnState.tasksDone&&earnState.tasksDone['steps_'+todayKey()])ed.textContent='✅ Goal reached — '+stepState.steps.toLocaleString()+' steps today';
    else ed.textContent=stepState.steps.toLocaleString()+' / '+stepState.goal.toLocaleString()+' steps today';
  }
}
function simulateSteps(n){addStep(n);showToast('👟 +'+n+' steps (demo)');speak('Added '+n+' demo steps. You are at '+stepState.steps.toLocaleString()+' steps today.');}

// ═══ VIDEO CALL ═══
var VIDEO_PROVIDER_KEY='totavivo_video_provider';
var videoProvider='facetime';
function loadVideoProvider(){try{videoProvider=TotaStorage.getItem(VIDEO_PROVIDER_KEY)||'facetime';}catch(e){videoProvider='facetime';}}
function setVideoProvider(p){videoProvider=p;try{TotaStorage.setItem(VIDEO_PROVIDER_KEY,p);}catch(e){}showToast('📹 Video calls will now use '+labelFor(p));}
function labelFor(p){return{facetime:'FaceTime',meet:'Google Meet',zoom:'Zoom',whatsapp:'WhatsApp',custom:'Custom link'}[p]||p;}
// In-app video-call modal state
var vcStream=null,vcTimer=null,vcStart=0,vcMuted=false,vcFacing='user';
function startVideoCall(name,phone){
  // Speak the status (this is what user wanted to keep)
  speak('Starting video call with '+name+' via '+labelFor(videoProvider)+'.');
  showToast('📹 Video calling '+name+'…');
  if(typeof fireIft==='function')fireIft('video_call_started',name,videoProvider);
  if(typeof logEvent==='function')logEvent('video_call_initiated',{contact:name,provider:videoProvider});
  openVideoCallModal(name);
  // Also fire the external URL scheme if user wants (so FaceTime/Meet/etc actually launch)
  var digits=(phone||'').replace(/[^0-9+]/g,'');
  var urls={
    facetime:digits?'facetime://'+digits:'facetime://',
    meet:'https://meet.google.com/new',
    zoom:'https://zoom.us/start/videomeeting',
    whatsapp:digits?'whatsapp://send?phone='+digits:'whatsapp://',
    custom:(function(){try{return TotaStorage.getItem('totavivo_video_custom_url')||'https://meet.google.com/new';}catch(e){return'https://meet.google.com/new';}})(),
  };
  var url=urls[videoProvider]||urls.facetime;
  // Open external app in background — many senior devices have FaceTime as default
  setTimeout(()=>{try{window.open(url,'_blank');}catch(e){}},700);
}
var VCALL_NOFEED_CONNECTING='<div style="font-size:50px;margin-bottom:10px">📹</div><div style="font-size:14px;font-weight:800;color:#fff">Connecting to camera…</div><div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:6px">Allow camera access when prompted.</div>';
function openVideoCallModal(name){
  var ov=document.getElementById('vcall-ov');
  var noFeed=document.getElementById('vcall-noFeed');
  document.getElementById('vcall-name').textContent='📹 '+name;
  document.getElementById('vcall-status').textContent='Connecting via '+labelFor(videoProvider)+'…';
  document.getElementById('vcall-timer').textContent='00:00';
  noFeed.innerHTML=VCALL_NOFEED_CONNECTING; // reset in case a prior call left an error message here
  noFeed.classList.remove('hide');
  document.getElementById('vcall-mute-btn').classList.remove('muted');
  document.getElementById('vcall-mute-btn').textContent='🎙';
  vcMuted=false;
  // Hangup SVG (red phone tilted)
  document.getElementById('vcall-hangup-btn').innerHTML=SVG_HANGUP;
  ov.classList.add('show');
  // Request camera
  var vid=document.getElementById('vcall-video');
  if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
    navigator.mediaDevices.getUserMedia({video:{facingMode:vcFacing},audio:true})
      .then(stream=>{
        vcStream=stream;
        vid.srcObject=stream;
        noFeed.classList.add('hide');
        document.getElementById('vcall-status').textContent='Connected · '+labelFor(videoProvider);
        startVcTimer();
        speak('Connected with '+name+'.');
      })
      .catch(err=>{
        // Replace the stale "Connecting…" placeholder so the two messages don't contradict each other
        noFeed.innerHTML='<div style="font-size:50px;margin-bottom:10px">🔇📹</div><div style="font-size:14px;font-weight:800;color:#fff">Camera unavailable</div><div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:6px">Continuing as an audio-only call.</div>';
        document.getElementById('vcall-status').textContent='Camera unavailable — using audio only';
        speak('Camera unavailable. Continuing with audio.');
        startVcTimer();
      });
  }else{
    noFeed.innerHTML='<div style="font-size:50px;margin-bottom:10px">🔇📹</div><div style="font-size:14px;font-weight:800;color:#fff">Camera not supported</div><div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:6px">Continuing as an audio-only call.</div>';
    document.getElementById('vcall-status').textContent='Camera not supported on this device';
    startVcTimer();
  }
}
function startVcTimer(){vcStart=new Date().getTime();clearInterval(vcTimer);vcTimer=setInterval(()=>{var s=Math.floor((new Date().getTime()-vcStart)/1000);var m=Math.floor(s/60);s=s%60;document.getElementById('vcall-timer').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');},500);}
function toggleVcMute(){vcMuted=!vcMuted;if(vcStream){vcStream.getAudioTracks().forEach(t=>t.enabled=!vcMuted);}var b=document.getElementById('vcall-mute-btn');if(vcMuted){b.classList.add('muted');b.textContent='🚫';showToast('🎙 Mic off');}else{b.classList.remove('muted');b.textContent='🎙';showToast('🎙 Mic on');}}
function flipVcCamera(){
  vcFacing=vcFacing==='user'?'environment':'user';
  if(!vcStream)return;
  vcStream.getTracks().forEach(t=>t.stop());
  navigator.mediaDevices.getUserMedia({video:{facingMode:vcFacing},audio:true})
    .then(stream=>{vcStream=stream;document.getElementById('vcall-video').srcObject=stream;showToast('🔄 Camera flipped');})
    .catch(()=>showToast('Camera flip failed'));
}
function endVideoCall(){
  clearInterval(vcTimer);
  var duration=vcStart?Math.round((new Date().getTime()-vcStart)/1000):0;
  if(vcStream){vcStream.getTracks().forEach(t=>t.stop());vcStream=null;}
  var vid=document.getElementById('vcall-video');if(vid)vid.srcObject=null;
  document.getElementById('vcall-ov').classList.remove('show');
  showToast('☎ Call ended');
  speak('Call ended.');
  if(typeof fireIft==='function')fireIft('video_call_ended','',new Date().toISOString());
  if(typeof logEvent==='function')logEvent('video_call_ended',{duration_s:duration});
}

// ═══ SPEECH — persists across updates ═══
// v3: default voice changed to an older British-male "butler" voice (Daniel on iOS/macOS,
// with cross-platform equivalents) — bumping the key forces everyone, including devices that
// already picked a voice under v2, to pick up the new default once.
var VOICE_STORAGE_KEY='totavivo_voice_settings_v3';
// Joke/robotic macOS voices to hide from the picker and never use as default
var ROBOT_VOICE_BLOCKLIST=['Albert','Bad News','Bahh','Bells','Boing','Bubbles','Cellos','Deranged','Good News','Hysterical','Jester','Junior','Kathy','Organ','Pipe','Ralph','Superstar','Trinoids','Whisper','Wobble','Zarvox','Princess','Bahnschrift','Cellos','Boing!','Bubbles!','Fred','Eddy','Reed','Rocko','Sandy','Shelley','Grandma','Grandpa','Flo'];
// High-quality natural voices to prefer (Mac/iOS/Chrome/Windows) — British male "butler" voices
// lead the list so they win as the default wherever available; American voices remain as the
// fallback on devices with no British male option installed.
var PREFERRED_VOICES=['Daniel','Google UK English Male','Microsoft Ryan','Microsoft George','Arthur','Oliver','Samantha','Karen','Ava','Allison','Susan','Tom','Moira','Serena','Fiona','Google US English','Google UK English Female','Microsoft Aria','Microsoft Jenny','Microsoft Guy','Siri','Nicky','Tessa'];
function isRobotVoice(v){return ROBOT_VOICE_BLOCKLIST.some(j=>v.name&&v.name.split(' ')[0]===j);}
function getNaturalVoices(){if(!synth)return[];var voices=synth.getVoices();return voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith('en')&&!isRobotVoice(v));}
function rankVoice(v){for(var i=0;i<PREFERRED_VOICES.length;i++){if(v.name&&v.name.startsWith(PREFERRED_VOICES[i]))return i;}return 100+(v.localService?0:50);}
function pickDefaultVoice(){var natural=getNaturalVoices();if(!natural.length)return null;natural.sort((a,b)=>rankVoice(a)-rankVoice(b));return natural[0];}
function saveVoiceSettings(){try{TotaStorage.setItem(VOICE_STORAGE_KEY,JSON.stringify({rate:voiceRate,pitch:voicePitch,vol:voiceVol,voiceName:selVoice?selVoice.name:null}));}catch(e){}}
function loadVoiceSettings(){try{var s=TotaStorage.getItem(VOICE_STORAGE_KEY);if(s){var d=JSON.parse(s);voiceRate=d.rate||0.9;voicePitch=d.pitch||1.0;voiceVol=d.vol||1.0;if(d.voiceName&&synth){var voices=synth.getVoices();var found=voices.find(v=>v.name===d.voiceName);if(found)selVoice=found;}}if(!selVoice)selVoice=pickDefaultVoice();}catch(e){selVoice=pickDefaultVoice();}}

function speak(txt){if(!synth)return;synth.cancel();var utt=new SpeechSynthesisUtterance(txt);if(selVoice)utt.voice=selVoice;utt.rate=voiceRate;utt.pitch=voicePitch;utt.volume=voiceVol;var bar=document.getElementById('speak-bar');utt.onstart=()=>{bar.classList.add('show');document.getElementById('speak-txt').textContent='🔊 '+txt.slice(0,48)+(txt.length>48?'…':'');};utt.onend=utt.onerror=()=>bar.classList.remove('show');synth.speak(utt);}
function speakBoosted(txt){if(!synth)return;synth.cancel();var utt=new SpeechSynthesisUtterance(txt);if(selVoice)utt.voice=selVoice;utt.rate=voiceRate;utt.pitch=voicePitch;utt.volume=1.0;var bar=document.getElementById('speak-bar');utt.onstart=()=>{bar.classList.add('show');document.getElementById('speak-txt').textContent='🔊 '+txt.slice(0,48)+(txt.length>48?'…':'');};utt.onend=utt.onerror=()=>bar.classList.remove('show');synth.speak(utt);}
function stopSpeak(){synth&&synth.cancel();document.getElementById('speak-bar').classList.remove('show');}
function speakMeds(){speak('Your medications for today: Metformin 500 milligrams due now. Lisinopril 10 milligrams due in 19 minutes. Aspirin already taken, great job! Vitamin D 3 due with breakfast.');}

// ── HOW MUCH VIVO READS ALOUD ──
// Three levels. This deliberately only ADDS reading on top of the app's existing spoken
// prompts — it never MUTES anything, so safety speech (fall alerts, 911) is untouched.
//  important  = quietest: just the app's own alerts/reminders/confirmations (existing behavior)
//  all        = also announces a one-line summary when you open Email or Meds
//  everyline  = also reads each email and medication line by line when you open those screens
var READ_MODE_KEY='totavivo_read_mode_v1';
var readAloudMode='important';
try{readAloudMode=TotaStorage.getItem(READ_MODE_KEY)||'important';}catch(e){}
function applyReadModeUI(){document.querySelectorAll('#readmode-grid .delay-opt').forEach(d=>d.classList.toggle('active',d.dataset.rm===readAloudMode));}
function setReadMode(m,el){
  readAloudMode=m;
  try{TotaStorage.setItem(READ_MODE_KEY,m);}catch(e){}
  document.querySelectorAll('#readmode-grid .delay-opt').forEach(d=>d.classList.remove('active'));
  if(el)el.classList.add('active');
  var msg=m==='important'?'Vivo will speak important requests only.':m==='all'?'Vivo will speak all requests and announce each screen.':'Vivo will read every line aloud when you open your emails or medications.';
  showToast('🗣️ '+msg);
  speak(msg);
  if(typeof logEvent==='function')logEvent('read_mode_changed',{mode:m});
}
function autoReadScreen(t){
  if(readAloudMode==='important'||!synth)return; // quietest — only the app's own prompts speak
  if(t==='email'&&typeof emailsData!=='undefined'&&emailsData.length){
    var unread=emailsData.filter(function(e){return e.unread;}).length;
    if(readAloudMode==='all')speak('You have '+emailsData.length+' emails, '+unread+' unread.');
    else speak('Reading your emails. '+emailsData.map(function(e){return 'From '+e.from+': '+e.subject+'.';}).join(' '));
  }else if(t==='medicine'){
    var meds=[].slice.call(document.querySelectorAll('#med-list .mn')).map(function(n){return n.textContent;});
    if(!meds.length)return;
    if(readAloudMode==='all')speak('You have '+meds.length+' medications listed today.');
    else speak('Reading your medications. '+meds.join('. ')+'.');
  }else if(t==='calendar'&&typeof upcomingAppts==='function'){
    var up=upcomingAppts(); // only upcoming — never reads past appointments aloud
    if(!up.length)return;
    if(readAloudMode==='all')speak('You have '+up.length+' upcoming appointments.');
    else speak('Your upcoming appointments. '+up.map(function(a){var p=a.date.split('-');return a.name+' on '+months[parseInt(p[1])-1]+' '+parseInt(p[2])+'.';}).join(' '));
  }
}

// ═══ VOICE PANEL ═══
function openVP(){loadVoices();document.getElementById('vp').classList.add('show');}
function closeVP(){document.getElementById('vp').classList.remove('show');}
function saveAndCloseVP(){
  // Voice choices already auto-save on every change (saveVoiceSettings runs in each setter),
  // so this just confirms and closes — but it's the reliable, always-reachable exit that the
  // corner X couldn't be on a notched phone.
  if(typeof saveVoiceSettings==='function')saveVoiceSettings();
  showToast('✅ Voice settings saved');
  speak('Your voice settings are saved.');
  closeVP();
}
function loadVoices(){
  if(!synth)return;
  var voices=synth.getVoices();
  if(!voices.length){synth.onvoiceschanged=loadVoices;return;}
  var natural=getNaturalVoices();
  natural.sort((a,b)=>rankVoice(a)-rankVoice(b));
  var top=natural.slice(0,10);
  // Make sure currently-selected voice appears even if it's lower-ranked
  if(selVoice&&!top.find(v=>v.name===selVoice.name))top.unshift(selVoice);
  var avatars=['👩 ','👨 ','👩‍⚕️ ','🎙️ ','👵 ','👴 ','🧑 ','👱 ','🧓 ','🗣️ '];
  var list=document.getElementById('vi-list');
  list.innerHTML='';
  if(!top.length){list.innerHTML='<div style="font-size:11px;color:var(--sub);padding:8px">No natural voices found on this device.</div>';return;}
  top.forEach((v,i)=>{
    var label=avatars[i%avatars.length]+v.name;
    var desc=v.lang+(v.localService?' · On Device':' · Cloud');
    var isActive=selVoice&&selVoice.name===v.name;
    var d=document.createElement('div');
    d.className='vi'+(isActive?' active':'');
    d.innerHTML='<div class="vinfo"><div class="vn">'+label+'</div><div class="vd">'+desc+'</div></div><button class="vplay">▶ Try</button>';
    d.querySelector('.vplay').onclick=(e)=>{e.stopPropagation();var u=new SpeechSynthesisUtterance('Hi '+seniorName+', this is '+v.name+'. I am Vivo. Long live your whole life!');u.voice=v;u.rate=voiceRate;u.pitch=voicePitch;u.volume=voiceVol;synth.cancel();synth.speak(u);};
    d.onclick=()=>{document.querySelectorAll('.vi').forEach(x=>x.classList.remove('active'));d.classList.add('active');selVoice=v;saveVoiceSettings();showToast('Voice saved: '+v.name);};
    list.appendChild(d);
  });
}
function setSpd(v){voiceRate=parseFloat(v);document.getElementById('spd-lbl').textContent=parseFloat(v)<0.8?'Slow':parseFloat(v)>1.1?'Fast':'Normal';saveVoiceSettings();}
function setPtch(v){voicePitch=parseFloat(v);document.getElementById('ptch-lbl').textContent=parseFloat(v)===1?'Normal':parseFloat(v)<1?'Lower':'Higher';saveVoiceSettings();}
function setVol(v){voiceVol=parseFloat(v);document.getElementById('vol-lbl').textContent=Math.round(v*100)+'%';saveVoiceSettings();}
function setRT(v,el){fallResponseTime=v;document.querySelectorAll('#resp-grid .delay-opt').forEach(d=>d.classList.remove('active'));el.classList.add('active');showToast('Response time: '+v+'s');}

// ═══ HEY VIVO ═══
// ═══ REAL VOICE RECOGNITION ═══
// Until now this panel only ever displayed "Listening…" as static text — the mic icon was
// decorative, and the only way to give a command was tapping one of the chips below. Nothing
// ever actually captured speech, which is exactly why talking to it did nothing. This wires
// up the real Web Speech API. Deliberately non-continuous: iOS Safari's continuous mode just
// keeps appending to one never-ending result instead of properly segmenting speech, so
// "listen for one command, then stop" is both simpler and the only mode that behaves
// consistently across iOS and Android. The tap-to-select chips stay fully working either
// way — if voice recognition isn't supported, fails, or mishears, tapping a chip still works.
var HeySR=window.SpeechRecognition||window.webkitSpeechRecognition;
var heyRecognition=null;
var heyGotFinal=false;
if(HeySR){
  heyRecognition=new HeySR();
  heyRecognition.continuous=false;
  heyRecognition.interimResults=true;
  heyRecognition.lang='en-US';
  heyRecognition.onstart=function(){
    heyGotFinal=false;
    var trans=document.getElementById('hey-trans');if(trans)trans.textContent='Listening…';
  };
  heyRecognition.onresult=function(e){
    var transcript='';
    for(var i=e.resultIndex;i<e.results.length;i++)transcript+=e.results[i][0].transcript;
    var trans=document.getElementById('hey-trans');
    if(trans)trans.textContent='"'+transcript+'"';
    if(e.results[e.results.length-1].isFinal&&transcript.trim()){
      heyGotFinal=true;
      processCmd(transcript.trim());
    }
  };
  heyRecognition.onerror=function(e){
    var trans=document.getElementById('hey-trans');if(!trans)return;
    if(e.error==='not-allowed'||e.error==='service-not-allowed')trans.textContent='Microphone access is off — tap the mic to allow it, or tap a command below.';
    else if(e.error==='no-speech')trans.textContent='Didn\'t catch that — tap the mic to try again, or tap a command below.';
    else if(e.error==='network')trans.textContent='No connection for voice recognition right now — tap a command below.';
    else if(e.error!=='aborted')trans.textContent='Having trouble hearing you — tap the mic to try again, or tap a command below.';
  };
  heyRecognition.onend=function(){
    var trans=document.getElementById('hey-trans');
    if(!heyGotFinal&&trans&&document.getElementById('hey-panel').classList.contains('show')&&trans.textContent==='Listening…'){
      trans.textContent='Didn\'t catch that — tap the mic to try again, or tap a command below.';
    }
  };
}
function startHeyListening(){
  // Interrupt Vivo the instant you tap to talk — otherwise the greeting keeps
  // playing over you and the mic can't hear your command.
  if(synth)synth.cancel();
  var bar=document.getElementById('speak-bar');if(bar)bar.classList.remove('show');
  if(!heyRecognition)return;
  try{heyRecognition.start();}catch(e){/* already listening — harmless, ignore */}
}
function stopHeyListening(){
  if(!heyRecognition)return;
  try{heyRecognition.abort();}catch(e){}
}
function openHeyVivo(){
  // Tapping the mic again while the panel is open should CLOSE it (and stop the
  // voice) — not start a second greeting talking over the first.
  var panel=document.getElementById('hey-panel');
  if(panel.classList.contains('show')){closeHeyVivo();return;}
  panel.classList.add('show');
  var trans=document.getElementById('hey-trans');
  if(trans)trans.textContent=heyRecognition?'Listening…':'Voice input isn\'t supported on this browser — tap a command below.';
  if(!synth){if(heyRecognition)startHeyListening();return;}
  synth.cancel();
  var greet=new SpeechSynthesisUtterance('Hey! This is Vivo. How can I help you today?');
  if(selVoice)greet.voice=selVoice;
  greet.rate=voiceRate;greet.pitch=voicePitch;greet.volume=voiceVol;
  var bar=document.getElementById('speak-bar');
  greet.onstart=function(){if(bar){bar.classList.add('show');document.getElementById('speak-txt').textContent='🔊 Hey! This is Vivo…';}};
  // Start listening exactly when the greeting finishes — not on a fixed delay — so Vivo's
  // own voice can never get picked up as if it were the user's command.
  greet.onend=greet.onerror=function(){
    if(bar)bar.classList.remove('show');
    if(heyRecognition&&document.getElementById('hey-panel').classList.contains('show'))startHeyListening();
  };
  synth.speak(greet);
}
function closeHeyVivo(){
  document.getElementById('hey-panel').classList.remove('show');
  stopHeyListening();
  // STOP Vivo talking. Without this, closing the panel (or tapping the X) left the
  // greeting playing on and on with no way to silence it.
  if(synth)synth.cancel();
  var bar=document.getElementById('speak-bar');if(bar)bar.classList.remove('show');
}
function processCmd(cmd){
  document.getElementById('hey-trans').textContent='"'+cmd+'"';var c=cmd.toLowerCase();
  if(typeof logEvent==='function')logEvent('voice_command_received',{cmd:cmd});
  setTimeout(()=>{
    if(c.includes('call susan')){closeHeyVivo();switchTab('phone');callContact('Susan Miller');}
    else if(c.includes('scan')||c.includes('barcode')||c.includes('bar code')||c.includes('qr')){closeHeyVivo();openCodeScanner();}
    else if(c.includes('email')){closeHeyVivo();switchTab('email');speak('Opening your emails, '+seniorName+'.');}
    else if(c.includes('facebook')||c.includes('instagram')||c.includes('youtube')){closeHeyVivo();switchTab('apps');speak('Opening your apps. Find it in the hub.');var appName=c.includes('facebook')?'Facebook':c.includes('instagram')?'Instagram':'YouTube';setTimeout(()=>openApp(appName.toLowerCase(),appName,'https://'+appName.toLowerCase()+'.com'),800);}
    else if(c.includes('apps')||c.includes('open my app')){closeHeyVivo();switchTab('apps');speak('Opening your apps hub.');}
    else if(c.includes('medication')||c.includes('meds')){closeHeyVivo();switchTab('medicine');speak('Opening your medications.');}
    else if(c.includes('bill')||c.includes('pay')){closeHeyVivo();switchTab('bills');speak('Opening your bills.');}
    else if(c.includes('calendar')){closeHeyVivo();switchTab('calendar');speak('Opening your calendar.');}
    else if(c.includes('contact')){closeHeyVivo();switchTab('contacts');speak('Opening your contacts.');}
    else if(c.includes('earn')||c.includes('money')||c.includes('balance')){closeHeyVivo();switchTab('earn');speak('Opening your earnings.');}
    else if(c.includes('phone')||c.includes('dial')||c.includes('favorites')){closeHeyVivo();switchTab('phone');speak('Opening your phone.');}
    else if(c.includes('smart home')||c.includes('lights')||c.includes('thermostat')||c.includes('lock')){closeHeyVivo();switchTab('smarthome');speak('Opening Smart Home controls.');}
    else if(c.includes('bluetooth')||c.includes('hearing aid')||c.includes('pendant')){closeHeyVivo();switchTab('bluetooth');speak('Opening Bluetooth devices.');}
    else if(c.includes('ifttt')||c.includes('automation')){closeHeyVivo();switchTab('ifttt');speak('Opening your automations.');}
    else if(c.includes('good morning')){closeHeyVivo();switchTab('smarthome');setTimeout(()=>runScene('morning'),400);}
    else if(c.includes('bedtime')||c.includes('good night')){closeHeyVivo();switchTab('smarthome');setTimeout(()=>runScene('bedtime'),400);}
    else if(c.includes('movie')){closeHeyVivo();switchTab('smarthome');setTimeout(()=>runScene('movie'),400);}
    else if(c.includes('away')||c.includes("i'm leaving")||c.includes('i am leaving')){closeHeyVivo();switchTab('smarthome');setTimeout(()=>runScene('away'),400);}
    else if(c.includes('read my medication')){closeHeyVivo();speakMeds();}
    else if(c.includes('due today')||c.includes('what is due')){closeHeyVivo();speak('You have 4 unread emails, 2 bills due this week totaling 127 dollars, and 3 medications due today.');}
    else if(c.includes("i'm okay")||c.includes('i am okay')){closeHeyVivo();fallOK();}
    else if(c.includes('help me')){closeHeyVivo();fallHelp();}
    else if(c.includes('home')){closeHeyVivo();switchTab('home');speak('Going to your home screen.');}
    else{
      // Anything not matched above falls through to the SAME search index the gold search bar
      // uses — so saying "fall detection", "insights", "steady touch", etc. actually goes there
      // instead of the old dead-end "let me help you with that" reply that helped with nothing.
      var hit=null;
      if(typeof SEARCH_INDEX!=='undefined'){
        hit=SEARCH_INDEX.find(function(x){return c.indexOf(x.label.toLowerCase())>=0;})
          ||SEARCH_INDEX.find(function(x){return x.kw.split(' ').some(function(k){return k.length>3&&c.indexOf(k)>=0;});});
      }
      if(hit){closeHeyVivo();speak('Opening '+hit.label+'.');hit.go();}
      else{speak('I heard '+cmd+', but I could not find that. Try saying something like fall detection, medications, or call Susan.');}
    }
  },400);
}

// ═══ SPELL HELP (tremor typing) ═══
// V7.1 — fully on-device. The old version POSTed to the Claude API with no key, so it
// silently never suggested anything. Now: fuzzy-match against built-in dictionaries
// (top medications + common appointment words) — works offline, instant, private.
var MED_DICT=['Metformin','Lisinopril','Aspirin','Atorvastatin','Amlodipine','Levothyroxine','Omeprazole','Losartan','Gabapentin','Hydrochlorothiazide','Sertraline','Simvastatin','Montelukast','Escitalopram','Furosemide','Pantoprazole','Prednisone','Tramadol','Trazodone','Duloxetine','Vitamin D3','Vitamin B12','Warfarin','Clopidogrel','Carvedilol','Metoprolol','Citalopram','Ibuprofen','Acetaminophen','Naproxen','Insulin','Eliquis','Xarelto','Ozempic','Jardiance','Synthroid','Crestor','Plavix','Norvasc','Zoloft','Lipitor','Nexium','Singulair','Lexapro','Lasix','Coumadin','Tylenol','Advil','Aleve','Melatonin','Fish Oil','Calcium','Magnesium','Potassium','Zinc','Multivitamin','Donepezil','Memantine','Tamsulosin','Finasteride','Latanoprost','Timolol','Albuterol','Spiriva','Symbicort','Januvia','Glipizide','Glimepiride','Pioglitazone','Allopurinol','Colchicine','Meloxicam','Celecoxib','Cyclobenzaprine','Oxybutynin','Rosuvastatin','Pravastatin','Ezetimibe','Fenofibrate','Ramipril','Enalapril','Valsartan','Olmesartan','Irbesartan','Diltiazem','Verapamil','Digoxin','Amiodarone','Apixaban','Rivaroxaban','Nitroglycerin','Entresto','Farxiga','Trulicity','Lantus','Humalog','Novolog','Tresiba','Victoza','Mounjaro','Rybelsus','Hydroxyzine','Loratadine','Cetirizine','Famotidine','Docusate','Senna','Miralax','Methocarbamol','Robaxin','Baclofen','Tizanidine','Zanaflex','Carisoprodol','Soma','Flexeril','Metaxalone','Skelaxin','Orphenadrine','Chlorzoxazone','Diclofenac','Ketorolac','Sumatriptan','Ondansetron','Bupropion','Venlafaxine','Buspirone','Clonazepam','Lorazepam','Alprazolam','Diazepam','Amoxicillin','Azithromycin','Cephalexin','Ciprofloxacin','Doxycycline','Prednisolone','Methylprednisolone','Tamsulosin','Sildenafil','Tadalafil','Levocetirizine','Fexofenadine','Guaifenesin','Dextromethorphan','Pseudoephedrine','Ranitidine','Sucralfate','Propranolol','Atenolol','Hydralazine','Clonidine','Spironolactone','Empagliflozin','Dapagliflozin','Semaglutide','Tirzepatide','Dulaglutide'];
var APPT_DICT=['Doctor','Dentist','Dermatologist','Cardiologist','Eye Doctor','Optometrist','Podiatrist','Physical Therapy','Blood Work','Lab Work','X-Ray','MRI','Checkup','Follow-up','Vaccination','Flu Shot','Haircut','Pharmacy','Hearing Test','Neurologist','Urologist','Mammogram','Colonoscopy','Dr. Patel','Dr. Lee','Dr. Chen','Hospital','Clinic','Surgery','Appointment'];
function _editDist(a,b){a=a.toLowerCase();b=b.toLowerCase();var m=a.length,n=b.length;if(Math.abs(m-n)>3)return 99;var row=[];for(var j=0;j<=n;j++)row[j]=j;for(var i=1;i<=m;i++){var prev=row[0];row[0]=i;for(j=1;j<=n;j++){var cur=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=cur;}}return row[n];}
function spellSuggest(val,dict){
  var v=val.toLowerCase();
  var exact=dict.find(w=>w.toLowerCase()===v);if(exact)return null; // already correct
  // 1) Completion: they typed the start of a word (4+ chars)
  if(v.length>=4){var pre=dict.find(w=>w.toLowerCase().startsWith(v));if(pre)return pre;}
  // 2) Fuzzy: shaky-finger typos within an edit distance budget
  var best=null,bestD=99;
  dict.forEach(w=>{var d=_editDist(v,w);if(d<bestD){bestD=d;best=w;}});
  var budget=v.length<=4?1:v.length<=7?2:3;
  return (best&&bestD<=budget)?best:null;
}
function aiChk(inp,key){var val=inp.value.trim();if(val.length<3){hideSug(key);return;}clearTimeout(spellTimers[key]);spellTimers[key]=setTimeout(()=>{var spin=document.getElementById(key+'-spin');spin.style.display='inline';var res=spellSuggest(val,key==='med'?MED_DICT:APPT_DICT);setTimeout(()=>{spin.style.display='none';if(res){document.getElementById(key+'-sug-txt').textContent='Vivo suggests: "'+res+'"';document.getElementById(key+'-sug').classList.add('show');if(key==='med')medSugVal=res;else apptSugVal=res;}else hideSug(key);},200);},500);}
function hideSug(k){var el=document.getElementById(k+'-sug');if(el)el.classList.remove('show');}
function apMS(){document.getElementById('med-inp').value=medSugVal;hideSug('med');}
// TYPE-THE-NAME → real FDA lookup. This is the reliable way to add a medicine from a
// PHARMACY-DISPENSED bottle: those bottles carry the pharmacy's own codes (a sign-up QR, an
// Rx-number barcode), NOT the manufacturer's NDC — so scanning them can't identify the drug.
// Typing the name always works. openFDA is free, open, and needs no key or "database access".
var _fdaHit=null;
async function lookupDrugByName(){
  var name=(document.getElementById('med-inp').value||'').trim()||medSugVal||'';
  var box=document.getElementById('med-fda');
  if(name.length<3){if(box){box.style.display='block';box.innerHTML='<span class="as2">Type the medicine name above first — for example, Methocarbamol.</span>';}speak('Please type the medicine name first, then tap look up.');return;}
  if(box){box.style.display='block';box.innerHTML='<span class="as2">🔎 Checking the FDA medicine list…</span>';}
  var qn=encodeURIComponent(name.replace(/"/g,''));
  var url='https://api.fda.gov/drug/ndc.json?search=generic_name:%22'+qn+'%22+OR+brand_name:%22'+qn+'%22&limit=1';
  try{
    var r=await fetch(url);if(!r.ok)throw 0;
    var data=await r.json();var hit=data.results&&data.results[0];if(!hit)throw 0;
    var brand=hit.brand_name||hit.generic_name||name;
    var gen=hit.generic_name||'';
    var form=hit.dosage_form?String(hit.dosage_form).toLowerCase():'';
    var ai=(hit.active_ingredients&&hit.active_ingredients[0])||null;
    var strength=ai&&ai.strength?ai.strength:'';
    _fdaHit={name:brand,dose:strength,form:form};
    box.innerHTML='<div style="font-size:12px;color:var(--text);line-height:1.5"><b>✅ Found: '+esc(brand)+'</b>'+(gen&&gen.toLowerCase()!==String(brand).toLowerCase()?' <span style="color:var(--sub)">('+esc(gen)+')</span>':'')+(form?' · '+esc(form):'')+(strength?' · '+esc(strength):'')+'</div>'+
      '<button class="bb gf" style="margin-top:7px;margin-bottom:0;min-height:38px;font-size:11px" onclick="useDrugLookup()"><div class="f"></div><span>✓ Use this — fill it in</span></button>';
    speak('Found '+brand+(strength?', '+strength:'')+'. Tap Use this to fill it in, then set your times and add it.');
    if(typeof logEvent==='function')logEvent('drug_name_lookup',{ok:true});
  }catch(e){
    _fdaHit=null;
    box.innerHTML='<span class="as2">Couldn\'t find "'+esc(name)+'" in the FDA list — check the spelling, or just tap ➕ Add Medication to add it exactly as you typed.</span>';
    speak('I could not find that name in the F D A list. Check the spelling, or add it as you typed it.');
    if(typeof logEvent==='function')logEvent('drug_name_lookup',{ok:false});
  }
}
function useDrugLookup(){
  if(!_fdaHit)return;
  document.getElementById('med-inp').value=_fdaHit.name||'';
  if(_fdaHit.dose)document.getElementById('med-dose').value=_fdaHit.dose;
  var box=document.getElementById('med-fda');if(box)box.style.display='none';
  hideSug('med');
  showToast('Filled in '+(_fdaHit.name||'medicine')+' — set your times, then ➕ Add');
  var t=document.getElementById('med-times');if(t)t.focus();
}
// Scan the (often messy) OCR text for a known medicine name, fuzzy-matching each word.
function findDrugInText(text){
  if(typeof MED_DICT==='undefined')return null;
  var words=String(text).toLowerCase().match(/[a-z]{4,}/g);if(!words)return null;
  for(var i=0;i<words.length;i++){
    var w=words[i];
    for(var j=0;j<MED_DICT.length;j++){
      var dname=MED_DICT[j].toLowerCase();
      if(dname.length<4)continue;
      if(w===dname)return MED_DICT[j];
      if(Math.abs(w.length-dname.length)<=2 && _editDist(w,dname)<=1)return MED_DICT[j];
    }
  }
  return null;
}
function apAS(){document.getElementById('appt-inp').value=apptSugVal;hideSug('appt');}

// ═══ MEDS ═══
function doTakeMed(name){
  document.querySelectorAll('.mi').forEach(item=>{
    if(item.querySelector('.mn')&&item.querySelector('.mn').textContent===name){
      item.querySelector('.min2 .mt').textContent='⏰ ✅ Taken today';
      item.querySelector('.mst').innerHTML='<span class="tkbdg">✅ Done</span>';
      if(typeof syncClient!=='undefined'&&syncClient&&syncState.linked&&item.dataset.syncId){
        syncClient.from('medications').update({last_taken_at:new Date().toISOString()}).eq('id',item.dataset.syncId).then(function(){});
      }
    }
  });
  speak(name+' taken. Great job '+seniorName+'!');showToast('✅ '+name+' marked as taken!');showSyncIndicator();
  if(typeof fireIft==='function')fireIft('med_taken',name,new Date().toISOString());
  if(typeof logEvent==='function')logResponseTime('medication_reminder_shown','medication_taken_logged',{med:name});
}
function addMed(){
  var name=document.getElementById('med-inp').value.trim()||medSugVal;
  var dose=document.getElementById('med-dose').value.trim()||'As prescribed';
  var freq=document.getElementById('med-freq').value.trim()||'Daily';
  var times=document.getElementById('med-times').value.trim()||'As needed';
  if(!name){showToast('Please enter a medication name');return;}
  var d=document.createElement('div');
  d.className='mi';
  d.innerHTML='<div class="mic" style="background:rgba(74,144,226,.12)">💊</div><div class="min2"><div class="mn">'+esc(name)+'</div><div class="md">'+esc(dose)+' · '+esc(freq)+'</div><div class="mt">⏰ '+esc(times)+'</div></div><div class="mst"><button class="tbtn" onclick="trigConf(\''+escJs('Take '+name)+'\',\'doTakeMed(&quot;'+escAttr(name)+'&quot;)\')">Take 💊</button></div>';
  document.getElementById('med-list').appendChild(d);
  if(typeof syncClient!=='undefined'&&syncClient&&syncState.linked){
    syncClient.from('medications').insert({household_id:syncState.householdId,name:name,dose:dose,frequency:freq,reminder_times:times}).select().single().then(function(res){
      if(res.data)d.dataset.syncId=res.data.id;
    });
  }
  ['med-inp','med-dose','med-freq','med-times'].forEach(id=>document.getElementById(id).value='');
  medSugVal='';hideSug('med');speak(name+' added.');showToast('✅ '+name+' added!');showSyncIndicator();
}
function syncPullMeds(){
  if(!syncClient||!syncState.linked)return;
  syncClient.from('medications').select('*').eq('household_id',syncState.householdId).then(function(res){
    if(res.error||!res.data)return;
    var list=document.getElementById('med-list');if(!list)return;
    var existingIds={};
    list.querySelectorAll('.mi[data-sync-id]').forEach(el=>existingIds[el.dataset.syncId]=true);
    res.data.forEach(function(m){
      if(existingIds[m.id])return; // already showing this one
      var d=document.createElement('div');
      d.className='mi';d.dataset.syncId=m.id;
      var taken=!!m.last_taken_at;
      d.innerHTML='<div class="mic" style="background:rgba(74,144,226,.12)">💊</div><div class="min2"><div class="mn">'+esc(m.name)+'</div><div class="md">'+esc(m.dose||'')+' · '+esc(m.frequency||'')+'</div><div class="mt">⏰ '+(taken?'✅ Taken today':esc(m.reminder_times||''))+'</div></div><div class="mst">'+(taken?'<span class="tkbdg">✅ Done</span>':'<button class="tbtn" onclick="trigConf(\''+escJs('Take '+m.name)+'\',\'doTakeMed(&quot;'+escAttr(m.name)+'&quot;)\')">Take 💊</button>')+'</div>';
      list.appendChild(d);
    });
  });
}
function syncFormatWhen(iso){
  try{
    var d=new Date(iso), now=new Date();
    var sameDay=d.toDateString()===now.toDateString();
    var yest=new Date(now);yest.setDate(now.getDate()-1);
    var isYest=d.toDateString()===yest.toDateString();
    var time=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    if(sameDay)return time;
    if(isYest)return 'Yesterday · '+time;
    return d.toLocaleDateString([],{month:'short',day:'numeric'});
  }catch(e){return '';}
}
function syncPullActivity(){
  if(!syncClient||!syncState.linked)return;
  // Free plan: most recent 15 events. Caregiver Premium: full history (see the Export button
  // for downloading it as CSV, also Premium-gated).
  var histLimit=isPremium()?200:15;
  syncClient.from('activity_log').select('*').eq('household_id',syncState.householdId).order('created_at',{ascending:false}).limit(histLimit).then(function(res){
    if(res.error||!res.data||!res.data.length)return; // keep demo rows until there's real activity
    var feed=document.getElementById('caregiver-activity-feed');if(!feed)return;
    var icons={call_initiated:'☎','911_initiated':'🆘',video_call_initiated:'📹',video_call_ended:'📹',message_sent:'💬',
      medication_taken_logged:'💊',medication_missed_confirmed:'💊',bill_paid:'✅',
      fall_event_triggered:'🆘',fall_auto_detected:'🆘',fall_alert_acknowledged:'✅',fall_help_requested:'🆘',fall_alert_no_response:'🆘',caregiver_escalation_initiated:'📞',
      contact_added:'👤',contact_edited:'👤',contact_deleted:'👤',contact_added_from_dialer:'👤',
      earn_cashout:'💰',steps_goal_reached:'👟'};
    feed.innerHTML=res.data.map(function(ev){
      var icon=icons[ev.event_type]||'•';
      var label=(typeof friendlyEvent==='function')?friendlyEvent(ev.event_type):ev.event_type;
      var when=syncFormatWhen(ev.created_at);
      return '<div class="act-row"><span>'+icon+'</span><span class="at2">'+esc(label)+'</span><span class="atm">'+esc(when)+'</span></div>';
    }).join('');
  });
}
function syncTouchLastActive(){
  if(!syncClient||!syncState.linked)return;
  syncClient.from('households').update({last_active_at:new Date().toISOString()}).eq('id',syncState.householdId).then(function(){});
}

// ═══ BILLS ═══
function doPay(btn,name,amt){
  var chip=document.querySelector('.acchip.sel');var acct=chip?chip.textContent.trim():'Chase';
  btn.querySelector('span').textContent='Paid ✓';btn.className='pbtn pd2';btn.disabled=true;
  // Paying a bill moves real numbers: Bills (paid so far) goes up, Left goes down — and the
  // Home tiles reflect it immediately, so the app behaves like one connected ledger instead
  // of each screen keeping its own disconnected story.
  var dollars=parseFloat(String(amt).replace(/[^0-9.]/g,''))||0;
  if(typeof balanceState!=='undefined'&&dollars>0){
    balanceState.bills.value=Math.round((balanceState.bills.value+dollars)*100)/100;
    balanceState.left.value=Math.max(0,Math.round((balanceState.left.value-dollars)*100)/100);
    // Money Left just dropped → every other Pay button must re-fill against the new balance.
    if(typeof renderMoneyScreens==='function')renderMoneyScreens();
    else if(typeof renderBalanceTiles==='function')renderBalanceTiles();
  }
  showToast('✅ '+name+' '+amt+' paid via '+acct+'!');speak(name+' paid.');
  lastAction={type:'pay',btn,name,dollars:dollars};
  showUndo('Paid '+amt+' to '+name);showSyncIndicator();
  if(typeof fireIft==='function')fireIft('bill_paid',name,amt,acct);
  if(typeof earnCashbackOnBill==='function')earnCashbackOnBill(amt);
  if(typeof logEvent==='function')logEvent('bill_paid',{bill:name,amount:amt,account:acct});
}
function selA(chip){document.querySelectorAll('.acchip').forEach(c=>c.classList.remove('sel'));chip.classList.add('sel');showToast('✓ Paying from: '+chip.textContent.trim());}
function doAppr(btn){var c=btn.closest('.appr-card');c.style.opacity='.4';c.querySelectorAll('button').forEach(b=>b.disabled=true);showToast('Decision saved');showSyncIndicator();}

// ═══ MESSAGES ═══
function scoreP(q){return plib.concat(learned).filter(p=>q===''||p.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>(usage[b]||0)-(usage[a]||0)).slice(0,4);}
function renderSugs(q){var r=document.getElementById('sug-row');if(!r)return;r.innerHTML=scoreP(q).map(p=>'<button class="sug-chip" onclick="useSug(\''+p.replace(/'/g,"\\'")+'\')">'+p+'</button>').join('');}
function useSug(p){document.getElementById('ci').value=p;renderSugs(p);}
function selC(el,name){document.querySelectorAll('.cbbl').forEach(c=>c.classList.remove('active'));el.classList.add('active');curContact=name;}
function onCI(inp){renderSugs(inp.value);}
function sendM(){var ci=document.getElementById('ci'),txt=ci.value.trim();if(!txt)return;var area=document.getElementById('chat-area'),b=document.createElement('div');b.className='bbl me';b.innerHTML=txt+'<div class="bt">You · now</div>';area.appendChild(b);if(!plib.includes(txt)&&!learned.includes(txt)){learned.unshift(txt);if(learned.length>30)learned.pop();}usage[txt]=(usage[txt]||0)+1;ci.value='';renderSugs('');area.scrollTop=area.scrollHeight;if(typeof logEvent==='function')logEvent('message_sent',{channel:'chat',recipient:curContact,length:txt.length});setTimeout(()=>{var reps=['Got it! 💙','Love you! ❤️','Sounds good!','Thanks Mom!'];var rb=document.createElement('div');rb.className='bbl them';rb.innerHTML=reps[Math.floor(Math.random()*reps.length)]+'<div class="bt">'+curContact+' · now</div>';area.appendChild(rb);area.scrollTop=area.scrollHeight;if(typeof logEvent==='function')logResponseTime('message_sent','message_reply_received',{from:curContact});},1000);}

// ═══ EMAIL ═══
function renderEmails(list){var el=document.getElementById('email-list');if(!list.length){el.innerHTML='<div style="text-align:center;color:var(--sub);padding:18px;font-size:12px">No emails found</div>';return;}el.innerHTML=list.map(e=>emailHTML(e)).join('');el.querySelectorAll('.email-item').forEach(item=>{item.addEventListener('click',()=>expandEmail(parseInt(item.dataset.id)));});el.querySelectorAll('.eact').forEach(btn=>btn.addEventListener('click',e=>e.stopPropagation()));}
function emailHTML(e){
  var isExp=expandedEmail===e.id;
  // Smart action buttons: a bill email offers "Add to Bills"; a pharmacy email offers
  // "Add to Meds" — or shows "✓ In your meds" when Vivo can see it's already listed.
  var smartBtns='';
  if(isExp){
    if(e.category==='bills')smartBtns+=emailBillsAdded[e.id]
      ?'<button class="eact green" onclick="event.stopPropagation();showToast(\'✓ Already in your Bill Hub\')">✓ In Bills</button>'
      :'<button class="eact" onclick="addBillFromEmail('+e.id+');event.stopPropagation()">💳 Add to Bills</button>';
    var medName=e.category==='medical'?emailMedName(e):null;
    if(medName)smartBtns+=(medAlreadyListed(medName)||emailMedsAdded[e.id])
      ?'<button class="eact green" onclick="event.stopPropagation();showToast(\'✓ '+escJs(medName)+' is already on your medication list\')">✓ In Meds</button>'
      :'<button class="eact" onclick="addMedFromEmail('+e.id+');event.stopPropagation()">💊 Add to Meds</button>';
  }
  return`<div class="email-item" data-id="${e.id}" style="${isExp?'background:rgba(74,144,226,.07);border-radius:11px;padding:7px;':''}"><div class="email-avatar">${e.avatar}</div><div class="email-info"><div class="email-from">${e.from}</div><div class="email-subject">${e.subject}</div>${isExp?`<div style="font-size:11px;color:var(--text);line-height:1.6;margin-top:5px;padding:8px;background:rgba(0,0,0,.18);border-radius:8px">${e.fullText}</div><div class="email-summary-box show"><div class="esb-label">✨ Vivo's Summary</div><div class="esb-text">${e.aiSummary}</div></div><div class="email-actions"><button class="eact green" onclick="speak('${e.aiSummary.replace(/'/g,"\\'")}');event.stopPropagation()">🔊 Read</button><button class="eact" onclick="replyEmail(${e.id});event.stopPropagation()">↩ Reply</button>${smartBtns}<button class="eact red" onclick="archiveEmail(${e.id});event.stopPropagation()">🗑</button></div>`:`<div class="email-preview">${e.preview}</div>`}</div><div class="email-meta"><span class="email-time">${e.time}</span>${e.unread?'<div class="email-unread"></div>':''}</div></div>`;
}
function expandEmail(id){var email=emailsData.find(e=>e.id===id);if(!email)return;expandedEmail=expandedEmail===id?null:id;email.unread=false;updateNotifCount();renderEmails(filteredEmails);if(expandedEmail)speak(email.aiSummary);}
function filterEmail(cat,btn){document.querySelectorAll('.efbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');filteredEmails=cat==='all'?[...emailsData]:emailsData.filter(e=>e.category===cat);expandedEmail=null;renderEmails(filteredEmails);}
function searchEmails(val){var v=val.toLowerCase();filteredEmails=!v?[...emailsData]:emailsData.filter(e=>e.from.toLowerCase().includes(v)||e.subject.toLowerCase().includes(v));renderEmails(filteredEmails);}
function replyEmail(id){var email=emailsData.find(e=>e.id===id);document.getElementById('compose-to').value=email.from;document.getElementById('compose-subj').value='Re: '+email.subject;showToast('↩ Reply to '+email.from);}

// ── EMAIL → BILLS / MEDS: connect what arrives in the inbox to the rest of the app ──
// A bill email gets an "Add to Bills" button that drops it into the Bill Hub with a working
// Pay button. A pharmacy email gets either "Add to Meds" or — if Vivo can see the medication
// is already on the list — a reassuring "✓ Already in your meds" instead.
var emailBillsAdded={},emailMedsAdded={};
function emailMedName(e){
  var txt=((e.subject||'')+' '+(e.fullText||'')).toLowerCase();
  return (typeof MED_DICT!=='undefined'?MED_DICT:[]).find(function(m){return txt.indexOf(m.toLowerCase())>=0;})||null;
}
function medAlreadyListed(name){
  return [].slice.call(document.querySelectorAll('#med-list .mn')).some(function(n){return n.textContent.toLowerCase().indexOf(name.toLowerCase())>=0;});
}
function addBillFromEmail(id){
  var e=emailsData.find(function(x){return x.id===id;});if(!e)return;
  if(emailBillsAdded[id]){showToast('✓ Already added to your Bill Hub');return;}
  var m=((e.fullText||'')+' '+(e.subject||'')).match(/\$\s?(\d+(?:\.\d{2})?)/);
  var dollars=m?(parseFloat(m[1])||0):0;
  var vendor=e.from;
  // Shared row builder → keeps the Bill Hub total, the balances and the Pay-button fills in sync.
  var row=addBillRow(vendor,dollars,'Added from email','📧');
  if(!row){showToast('Could not open Bill Hub');return;}
  emailBillsAdded[id]=true;
  showToast('💳 '+vendor+' '+fmtMoney(dollars)+' added to your Bill Hub');
  speak(vendor+' bill for '+Math.round(dollars)+' dollars added to your bill hub.');
  if(typeof logEvent==='function')logEvent('bill_added_from_email',{vendor:vendor,amount:dollars});
  renderEmails(filteredEmails);
}
function addMedFromEmail(id){
  var e=emailsData.find(function(x){return x.id===id;});if(!e)return;
  var name=emailMedName(e);
  if(!name){showToast('No medication name found in this email');return;}
  if(medAlreadyListed(name)||emailMedsAdded[id]){
    showToast('✓ '+name+' is already on your medication list');
    speak('Good news — '+name+' is already on your medication list.');
    return;
  }
  var d=document.createElement('div');d.className='mi';
  d.innerHTML='<div class="mic" style="background:rgba(74,144,226,.12)">💊</div><div class="min2"><div class="mn">'+esc(name)+'</div><div class="md">As prescribed · From email</div><div class="mt">⏰ Ask your pharmacist</div></div><div class="mst"><button class="tbtn" onclick="trigConf(\''+escJs('Take '+name)+'\',\'doTakeMed(&quot;'+escAttr(name)+'&quot;)\')">Take 💊</button></div>';
  document.getElementById('med-list').appendChild(d);
  emailMedsAdded[id]=true;
  showToast('💊 '+name+' added to your medications');
  speak(name+' has been added to your medication list.');
  if(typeof logEvent==='function')logEvent('med_added_from_email',{med:name});
  renderEmails(filteredEmails);
}
function archiveEmail(id){emailsData=emailsData.filter(e=>e.id!==id);filteredEmails=filteredEmails.filter(e=>e.id!==id);expandedEmail=null;updateNotifCount();renderEmails(filteredEmails);showToast('Email archived');}
function sendEmail(){
  // V7 — really sends: hands the message to the device's mail app so users can
  // test the system by emailing themselves.
  var to=document.getElementById('compose-to').value.trim();
  if(!to){showToast('Please enter a recipient');speak('Please enter who the email is going to.');return;}
  var subj=document.getElementById('compose-subj').value.trim()||'Message from TotaVivo';
  var body=document.getElementById('compose-body').value.trim();
  if(/@/.test(to)){
    window.location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
    speak('Your email is ready in your mail app. Tap Send there to deliver it.');
    showToast('📤 Opening your mail app — tap Send there to deliver');
    document.getElementById('compose-to').value='';document.getElementById('compose-subj').value='';document.getElementById('compose-body').value='';
    if(typeof logEvent==='function')logEvent('email_sent',{to_has_address:true});
  }else{
    // No @ = we have no address to send to. Don't pretend it sent — ask for a real one.
    speak('Please enter a full email address, like name at gmail dot com, so your email can actually be sent.');
    showToast('✉️ Enter a full email address (like name@gmail.com) to send');
  }
}
// Real dictation — the old version FAKED it (waited 2 seconds, then pasted canned text no
// matter what you said, which is why it "didn't listen"). Now it actually transcribes speech
// and APPENDS to what's already typed, one sentence per tap: speak, pause, tap 🎙️ again for
// the next sentence. Appending (never replacing) means it can't wipe out typed text either.
var dictRec=null;
function dictateEmail(){
  var body=document.getElementById('compose-body');
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    showToast('⚠️ Voice dictation isn\'t supported in this browser — please type your message');
    speak('Voice dictation is not supported here. Please type your message.');
    if(body)body.focus();
    return;
  }
  if(dictRec){try{dictRec.abort();}catch(e){}}
  dictRec=new SR();
  dictRec.lang='en-US';
  dictRec.interimResults=true;
  dictRec.continuous=false; // one sentence per tap — the only mode that behaves on iOS
  var gotText=false;
  dictRec.onresult=function(ev){
    var t='';
    for(var i=ev.resultIndex;i<ev.results.length;i++)t+=ev.results[i][0].transcript;
    if(ev.results[ev.results.length-1].isFinal&&t.trim()){
      gotText=true;
      var cur=body.value.trim();
      var sentence=t.trim();
      sentence=sentence.charAt(0).toUpperCase()+sentence.slice(1);
      if(!/[.!?]$/.test(sentence))sentence+='.';
      body.value=(cur?cur+' ':'')+sentence;
      showToast('✅ Got it — tap 🎙️ to add more, or tap Send');
    }
  };
  dictRec.onerror=function(ev){
    if(ev.error==='not-allowed'||ev.error==='service-not-allowed')showToast('🎙️ Microphone access is off — allow it to dictate');
    else if(ev.error!=='aborted')showToast('Didn\'t catch that — tap 🎙️ and try again');
  };
  dictRec.onend=function(){if(!gotText)showToast('Didn\'t hear anything — tap 🎙️ and speak your message');};
  speak('Speak your message now.');
  // Start listening AFTER the prompt finishes so Vivo's own voice isn't transcribed
  setTimeout(function(){try{dictRec.start();showToast('🎙️ Listening — speak one sentence');}catch(e){}},1200);
}
function connectEmail(provider){
  // Honest: a web page can't actually log into a real mailbox. Don't fake a "connected!"
  // toast — tell the truth so testers aren't misled.
  showToast('🔒 '+provider+' sign-in isn\'t available in this demo — coming in the App Store version');
  speak('Connecting a real '+provider+' account is not available in this demo version. It will come in the App Store version of TotaVivo.');
  if(typeof logEvent==='function')logEvent('email_connect_attempt',{provider:provider});
}
function updateNotifCount(){var unread=emailsData.filter(e=>e.unread).length;document.getElementById('notif-count').textContent=unread>0?unread+' new':'';}

// ═══ FALL DETECTION — ENHANCED ═══
var emergencyContacts=['Susan Miller','Robert Miller','Linda Thompson'];
var fallAttemptPhase=0;
var alarmInterval=null;
var alarmTimeouts=[];   // every escalation step's timer — cleared the moment the user cancels

function toggleFall(el){el.classList.toggle('on');fallActive=el.classList.contains('on');if(fallActive){showToast('🎙️ Fall detection ON');speak('Fall detection is now active, '+seniorName+'. I am listening and I am here for you.');}else showToast('Fall detection OFF');}
function testFall(){triggerFall();}

function triggerFall(source){
  fallAttemptPhase=0;
  document.getElementById('fov-sub').textContent='A possible fall was detected.\nI am here for you, '+seniorName+'. Please respond.';
  document.getElementById('fall-ov').classList.add('show');
  // Escalating volume + repeated tries
  speak(seniorName+', are you okay? This is Vivo. A possible fall was detected. Please tap I am okay or say Vivo I am okay. I am here to help you any way I can. Do you need me to call someone?');
  startFallCountdown();
  if(typeof fireIft==='function')fireIft('fall_detected',seniorName,new Date().toISOString());
  if(typeof logEvent==='function')logEvent('fall_event_triggered',{source:source||'unknown'});
  if(navigator.vibrate)navigator.vibrate([500,200,500,200,500]);
}

function startFallCountdown(){
  var total=fallResponseTime*1000,start=Date.now(),arc=document.getElementById('farc'),num=document.getElementById('fnum'),cd=document.getElementById('fcd');
  clearInterval(fallTimerInterval);
  fallTimerInterval=setInterval(()=>{
    var e=Date.now()-start,frac=Math.min(e/total,1);
    arc.style.strokeDashoffset=289*frac;
    var rem=Math.max(0,Math.ceil((total-e)/1000));
    num.textContent=rem;if(cd)cd.textContent=rem;
    if(frac>=1){clearInterval(fallTimerInterval);noResponse();}
  },100);
  // Re-ask halfway through, louder (TEMPORARY boost — does not overwrite saved volume)
  setTimeout(()=>{
    if(document.getElementById('fall-ov').classList.contains('show')){
      speakBoosted(seniorName+'! Please respond. This is Vivo. Are you okay? I can call Susan or emergency services. Please tap the screen or speak to me.');
    }
  },fallResponseTime*500);
}

function playPreRecorded(){
  var msgs=['The front door is unlocked. I may need assistance.','The back door or garage door is unlocked.','I am hurt. Please help me. I need medical assistance.','I may have missed my medication. Please check on me.'];
  speak(msgs[selectedPreRecord-1]);
  showToast('📢 Playing your pre-recorded message to responders');
}

function selectPreRecord(n){
  selectedPreRecord=n;
  for(var i=1;i<=4;i++){var el=document.getElementById('prs-'+i);if(el){el.textContent=i===n?'✓ Active':'Select';el.className=i===n?'pr-msg-sel selected':'pr-msg-sel';}}
  var msgs=['The front door is unlocked','The back door is unlocked','I am hurt, please help','Medication check needed'];
  showToast('✅ Active message: "'+msgs[n-1]+'"');
}

function fallOK(){
  clearInterval(fallTimerInterval);clearInterval(alarmInterval);
  alarmTimeouts.forEach(clearTimeout);alarmTimeouts=[];
  document.getElementById('fall-ov').classList.remove('show');
  document.getElementById('alarm-ov').classList.remove('show');
  speak('So glad you are okay '+seniorName+'! I am always here watching out for you. Long live your whole life!');
  showToast('✅ Alert cancelled — you are okay! 💚');
  if(typeof fireIft==='function')fireIft('fall_cleared',seniorName,'user_responded_ok');
  if(typeof logEvent==='function')logResponseTime('fall_event_triggered','fall_alert_acknowledged',{outcome:'ok'});
}
function fallHelp(){clearInterval(fallTimerInterval);document.getElementById('fall-ov').classList.remove('show');showAlarm(true);if(typeof fireIft==='function')fireIft('emergency_help','fall','help_requested');smartHomeEmergencyResponse();if(typeof logEvent==='function')logResponseTime('fall_event_triggered','fall_help_requested');}
function smartHomeEmergencyResponse(){
  // Flash porch & living-room lights, unlock front door for responders
  try{
    var front=document.getElementById('lock-front');
    if(front&&!front.classList.contains('unlocked')){toggleLock('front');}
    // Turn all lights on full
    for(var k in shRooms){shRooms[k].devices.forEach(d=>{if(d.type==='dimmer'){d.on=true;d.level=100;}else if(d.type==='switch'&&d.icon==='💡')d.on=true;});}
    if(shCurrentRoom)renderShDevices();
    showToast('🏡 Smart Home Interface: Lights ON, front door unlocked for responders');
  }catch(e){/* smart home not initialized yet */}
}
function noResponse(){document.getElementById('fall-ov').classList.remove('show');showAlarm(false);if(typeof logEvent==='function')logEvent('fall_alert_no_response',{timeout_s:fallResponseTime});}

// ── FALL ESCALATION — HONEST, and built from Randy's mother-in-law's fall ───────
// She fell, crawled to another room to reach a phone, called family, and the reinforced
// front door then kept a 300 lb rescuer OUT — 3 hours total. So this flow does what actually
// helps: FAMILY FIRST (911 second), UNLOCK THE DOOR so help gets in, show a CAMERA of outside
// so she can see help arriving, and a loud siren + flashing lights so anyone nearby finds her.
// The old code was a scripted animation that SPOKE "Calling Susan now" and displayed "911
// notified. Help is on the way." while placing NO call. A web app cannot call anyone by
// itself — so nothing here ever claims it did. (Sensitivity/countdown/pause are untouched.)
function showAlarm(isHelp){
  document.getElementById('alarm-ov').classList.remove('show'); // replaced by the live console
  if(typeof warmBeaconAudio==='function')warmBeaconAudio();
  startEmergencyBeacon('panic');   // REAL siren + flashing lights + vibration + screen wake-lock
  // UNLOCK THE DOOR + lights — the lesson of the 3 hours. This IS a fall at home; help must get in.
  if(typeof smartHomeEmergencyResponse==='function'){try{smartHomeEmergencyResponse();}catch(_){}}
  renderFallHelpConsole(isHelp);
  if(panic&&panic.camTimer){clearInterval(panic.camTimer);}
  if(typeof panic!=='undefined')panic.camTimer=setInterval(fallCameraRefresh,2500); // keep the outside view live
  try{ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(function(pos){
    if(typeof sensorState!=='undefined'&&sensorState) sensorState.location={lat:pos.coords.latitude.toFixed(5),lng:pos.coords.longitude.toFixed(5),acc:Math.round(pos.coords.accuracy)};
    renderFallHelpConsole(isHelp);
  },function(){},{enableHighAccuracy:true,timeout:8000,maximumAge:30000}); }catch(_){}
  var msgs=['The front door is unlocked. I may need assistance.','The back door or garage door is unlocked.','I am hurt. Please help me. I need medical assistance.','I may have missed my medication. Please check on me.'];
  var pre=msgs[(typeof selectedPreRecord!=='undefined'?selectedPreRecord:1)-1]||msgs[0];
  speak((isHelp?'Help requested. ':'No answer. ')+'The alarm is sounding and the front door is unlocked so help can get in. '+pre+' If someone is with you, tap to call your family or 911. If you are okay, press I am okay.');
  if(typeof logEvent==='function')logEvent(isHelp?'fall_help_console_shown':'fall_alert_no_response',{});
}
function fallCameraHtml(){
  if(typeof cameras!=='undefined'&&!Array.isArray(cameras)&&typeof loadCameras==='function')loadCameras();
  if(typeof cameras==='undefined'||!Array.isArray(cameras)||!cameras.length)return '';
  var c=cameras.filter(function(x){return x.url;})[0];
  if(!c)return ''; // only a demo camera (no real feed) — skip; not useful for "see who's arriving"
  return '<div class="bp-cap" style="font-weight:900;color:#fff">See who\'s arriving — '+esc(c.name)+':</div>'+
         '<div style="border-radius:12px;overflow:hidden;border:2px solid rgba(255,255,255,.45)"><img id="fall-cam-img" alt="'+escAttr(c.name)+'" style="width:100%;display:block;background:#0a1526;min-height:120px"></div>';
}
function fallCameraRefresh(){
  if(typeof cameras==='undefined'||!Array.isArray(cameras))return;
  var c=cameras.filter(function(x){return x.url;})[0];if(!c)return;
  var img=document.getElementById('fall-cam-img');
  if(img)img.src=c.url+(c.url.indexOf('?')>=0?'&':'?')+'_t='+Date.now();
}
function renderFallHelpConsole(isHelp){
  var el=document.getElementById('beacon-panic');if(!el)return;
  var contacts=(typeof guardianContacts==='function')?guardianContacts():[];
  var loc=(typeof guardianLocationLink==='function')?guardianLocationLink():'';
  var who=(typeof seniorName!=='undefined'&&seniorName)?seniorName:'This person';
  var msgs=['The front door is unlocked. I may need assistance.','The back door or garage door is unlocked.','I am hurt. Please help me. I need medical assistance.','I may have missed my medication. Please check on me.'];
  var pre=msgs[(typeof selectedPreRecord!=='undefined'?selectedPreRecord:1)-1]||msgs[0];
  var html='<div class="bp-count" style="font-size:16px;font-weight:900;line-height:1.3">🆘 '+esc(who)+' may have fallen<br>and may need help</div>';
  html+='<div class="bp-honest" style="font-size:12px"><b>If you are nearby:</b> "'+esc(pre)+'"</div>';
  // 1) FAMILY / CAREGIVERS FIRST — this is what really happens in a fall.
  html+='<div class="bp-cap" style="font-weight:900;color:#fff">Reach family first:</div>';
  if(contacts.length){
    contacts.forEach(function(c){
      if(c.number){
        var body='I may have fallen and need help. '+(loc?('Here is where I am: '+loc):'My location is not available right now.');
        html+='<button class="bp-btn contact-call" onclick="location.href=\'tel:'+escJs(c.number)+'\'">📞 Call '+esc(c.name)+'</button>';
        html+='<button class="bp-btn contact-text" onclick="location.href=\''+escJs('sms:'+c.number+'?&body='+encodeURIComponent(body))+'\'">💬 Text '+esc(c.name)+' my location</button>';
      }else{
        html+='<button class="bp-btn contact-text" disabled>📞 '+esc(c.name)+' — add a number to enable</button>';
      }
    });
  }else{ html+='<div class="bp-cap">No family contacts set yet — add them in Family.</div>'; }
  // 2) 911 SECOND
  html+='<a class="bp-btn call911" href="tel:911" onclick="if(typeof logEvent===\'function\')logEvent(\'fall_911_tapped\')" style="display:flex;align-items:center;justify-content:center;text-decoration:none;margin-top:8px">📞 Then Call 911</a>';
  html+='<div class="bp-cap">Tap to call 911 — opens the phone\'s dialer; someone must press the green Call button.</div>';
  // 3) DOOR UNLOCKED — the whole lesson of the 3-hour story.
  html+='<div class="bp-honest" style="border-color:rgba(0,224,150,.45);background:rgba(0,224,150,.13);color:#eafff4">🔓 <b>Front door unlocked</b> and lights turned on, so help can get inside without breaking down the door.</div>';
  // 4) CAMERA VIEW OF OUTSIDE — so she can see help arriving and stay calm.
  html+=fallCameraHtml();
  if(loc)html+='<div class="bp-cap">📍 <a href="'+escAttr(loc)+'" target="_blank" rel="noopener" style="color:#fff">Open '+esc(who)+'\'s location in Maps</a></div>';
  // Honest banner — never claims a call was placed.
  html+='<div class="bp-honest">TotaVivo <b>cannot call anyone by itself — nothing has been sent.</b> The siren and flashing lights are on so people nearby can find '+esc(who)+'. Automatic calling and a 24/7 team that dispatches help for you come in the App Store version.</div>';
  html+='<button class="bp-safe" onclick="cancelAlarm()">✅ I AM OKAY<span class="bps-sub">Tap to stop the alarm</span></button>';
  el.innerHTML=html;
  fallCameraRefresh();
}

function cancelAlarm(){
  clearInterval(alarmInterval);
  alarmTimeouts.forEach(clearTimeout);alarmTimeouts=[];
  if(typeof panic!=='undefined'&&panic.camTimer){clearInterval(panic.camTimer);panic.camTimer=null;}
  document.getElementById('alarm-ov').classList.remove('show');
  if(typeof stopBeacon==='function')stopBeacon(); // stop the real siren + flashing lights + vibration
  speak('Alert cancelled. I am so glad you are okay '+seniorName+'. Remember, I am always here for you. Just tap my microphone anytime.');
  if(typeof logEvent==='function')logEvent('fall_alert_acknowledged',{outcome:'im_okay'});
}

function addEmergencyContact(){showToast('Open Contacts to add an emergency contact, then drag to reorder');}

function recordNewMessage(){speak('Recording feature is available on your real device. Tap the microphone and speak your message clearly.');showToast('🎙️ On your device: tap mic to record your message');}

// ═══ MAGNIFIER ═══
// V7 — magnifier is genuinely camera-driven. Magnify zooms the live feed; Scan & Read runs
// real OCR (Tesseract.js, loaded on demand) on a captured frame and reads what the camera saw.
async function openCamera(){
  if(camStream)return true;
  camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  var v=document.getElementById('cam-vid');
  v.srcObject=camStream;await v.play();
  document.getElementById('cam-ph').style.display='none';v.style.display='block';
  return true;
}
function camFail(){
  document.getElementById('cam-ph').style.display='flex';
  document.getElementById('cam-ph').innerHTML='<div class="cpi">📷</div><p style="color:var(--red);font-weight:800">Camera not available.<br>Please allow camera access<br>so I can magnify and read for you.</p>';
  speak('I could not open the camera. Please allow camera access.');
}
async function startMag(){
  try{await openCamera();document.getElementById('zsl').disabled=false;showToast('📷 Magnifier active — slide to zoom');speak('Magnifier on. Slide the bar to zoom.');}
  catch(e){camFail();}
}
async function startScan(){
  try{
    await openCamera();
    document.getElementById('zsl').disabled=false;
    showToast('📄 Hold the camera steady over the text…');speak('Hold the camera steady over the text.');
    setTimeout(doScan,1600);
  }catch(e){camFail();}
}
var ocrLoading=false;
function ensureOCR(){return new Promise(function(res,rej){
  if(window.Tesseract)return res();
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload=function(){ocrLoading=false;res();};
  s.onerror=function(){ocrLoading=false;rej(new Error('offline'));};
  ocrLoading=true;document.head.appendChild(s);
});}
async function doScan(){
  var v=document.getElementById('cam-vid');
  if(!camStream||!v.videoWidth){showToast('Camera not ready — tap Scan & Read again');return;}
  // Preprocess for better OCR on small, curved, glossy labels: upscale ~2x and grayscale.
  var scale=Math.min(2,2400/Math.max(1,v.videoWidth));if(scale<1)scale=1;
  var c=document.createElement('canvas');c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
  var ctx=c.getContext('2d');ctx.drawImage(v,0,0,c.width,c.height);
  try{var img=ctx.getImageData(0,0,c.width,c.height),px=img.data;
    for(var p=0;p<px.length;p+=4){var g=(px[p]*0.3+px[p+1]*0.59+px[p+2]*0.11);g=(g-128)*1.35+128;g=g<0?0:g>255?255:g;px[p]=px[p+1]=px[p+2]=g;}
    ctx.putImageData(img,0,0);}catch(_){}
  showToast('🔎 Reading the text…');speak('Reading. One moment.');
  try{
    await ensureOCR();
    var r=await Tesseract.recognize(c,'eng');
    var t=(r.data.text||'').replace(/\s+/g,' ').trim();
    var drug=findDrugInText(t);
    // Reject gibberish: OCR on a bad frame returns junk like "Na . Ny ; A. - si". Don't read
    // nonsense aloud — require either a recognized medicine name or enough real letters/words.
    var letters=(t.match(/[a-z]/gi)||[]).length;
    var realWords=(t.match(/[a-z]{3,}/gi)||[]).length;
    var looksReal=!!drug || (letters/Math.max(1,t.length)>=0.5 && realWords>=2);
    if(t.length<3 || !looksReal){
      document.getElementById('scan-res').classList.remove('show');
      document.getElementById('read-btn').classList.remove('show');
      showToast('Couldn\'t read the label clearly — try again in good light, or type the name');
      speak('I could not read that clearly. Try again in bright light, hold steady and fill the screen with the label — or type the medicine name in Add Medication.');
      if(typeof logEvent==='function')logEvent('scan_read_ocr',{chars:t.length,ok:false});
      return;
    }
    var extra=drug?'<button class="bb gf" style="margin-top:8px;margin-bottom:0;min-height:40px;font-size:12px" onclick="addDrugFromScan(\''+escJs(drug)+'\')"><div class="f"></div><span>➕ Add '+esc(drug)+' to my medicines</span></button>':'';
    document.getElementById('scan-txt').innerHTML=esc(t)+extra;
    document.getElementById('scan-res').classList.add('show');
    document.getElementById('read-btn').classList.add('show');
    if(drug){speak('I see '+drug+' on the label. Tap the green button to add it to your medicines.');}
    else speak(t);
    if(typeof logEvent==='function')logEvent('scan_read_ocr',{chars:t.length,ok:true,drug:!!drug});
  }catch(e){
    showToast('📶 Reading needs internet the first time — connect and try again');
    speak('I need an internet connection the first time, to load my reading tool. Please connect and try again.');
  }
}
function addDrugFromScan(name){
  switchTab('medicine');
  setTimeout(function(){
    var inp=document.getElementById('med-inp');if(inp){inp.value=name;inp.scrollIntoView({block:'center'});}
    lookupDrugByName();
  },250);
}
function setZoom(v){document.getElementById('zlbl').textContent=v+'×';var vid=document.getElementById('cam-vid');if(vid){vid.style.transform='scale('+v+')';vid.style.transformOrigin='center';}}
function stopCam(){stopCodeScan();if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}var v=document.getElementById('cam-vid');v.style.display='none';v.srcObject=null;document.getElementById('cam-ph').style.display='flex';document.getElementById('cam-ph').innerHTML='<div class="cpi">📷</div><p>Tap <strong>Magnify</strong> to zoom in<br>Tap <strong>Scan &amp; Read</strong> to hear text aloud<br>Tap <strong>Read a Code</strong> for QR codes &amp; medicine barcodes</p>';document.getElementById('zsl').disabled=true;document.getElementById('zsl').value=1;document.getElementById('zlbl').textContent='1×';document.getElementById('scan-res').classList.remove('show');document.getElementById('read-btn').classList.remove('show');var cr=document.getElementById('code-res');if(cr)cr.classList.remove('show');}

// ════════════════════════════════════════════════════════════════
// ═══ CODE SCANNER — reads ANY barcode or QR code, then translates it
//     into plain English with safe one-tap actions.
//     Engine: native BarcodeDetector (Android/Chrome) when available,
//     otherwise ZXing (loaded on demand, like the OCR tool).
//     Medicine bottles: UPC/EAN/GS1-DataMatrix → FDA drug database lookup.
// ════════════════════════════════════════════════════════════════
var codeScanTimer=null,codeDetector=null,zxingReader=null,zxingTried=false;
var lastScan=null,lastCodeValue='',lastCodeTime=0;
var CODE_FMT_LABELS={qr_code:'QR Code',ean_13:'Product Barcode (EAN-13)',ean_8:'Product Barcode (EAN-8)',upc_a:'Product Barcode (UPC-A)',upc_e:'Product Barcode (UPC-E)',code_128:'Code 128 Barcode',code_39:'Code 39 Barcode',code_93:'Code 93 Barcode',codabar:'Codabar Barcode',itf:'ITF Barcode',data_matrix:'Data Matrix Code',pdf417:'PDF417 Code',aztec:'Aztec Code',rss_14:'GS1 DataBar',unknown:'Code'};
function normFmt(f){return String(f||'unknown').toLowerCase().replace(/-/g,'_');}
function ensureZXing(){return new Promise(function(res,rej){
  if(window.ZXing&&window.ZXing.BrowserMultiFormatReader)return res();
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  s.onload=function(){res();};
  s.onerror=function(){rej(new Error('offline'));};
  document.head.appendChild(s);
});}
function openCodeScanner(){switchTab('magnifier');setTimeout(startCodeScan,300);}
async function startCodeScan(){
  try{await openCamera();}catch(e){camFail();return;}
  document.getElementById('zsl').disabled=false;
  document.getElementById('scan-res').classList.remove('show');
  document.getElementById('read-btn').classList.remove('show');
  document.getElementById('code-res').classList.remove('show');
  stopCodeScan();
  // Pick a decoder: native first, ZXing fallback
  if(!codeDetector&&('BarcodeDetector' in window)){
    try{var fmts=await window.BarcodeDetector.getSupportedFormats();codeDetector=new window.BarcodeDetector({formats:fmts});}catch(e){codeDetector=null;}
  }
  if(!codeDetector){
    try{
      await ensureZXing();
      if(!zxingReader){var hints=new Map();hints.set(ZXing.DecodeHintType.TRY_HARDER,true);zxingReader=new ZXing.BrowserMultiFormatReader(hints);}
    }catch(e){
      showToast('📶 Code reading needs internet the first time — connect and try again');
      speak('I need an internet connection the first time, to load my code reading tool. Please connect and try again.');
      return;
    }
  }
  showToast('🏷️ Point the camera at the barcode or QR code…');
  speak('Point your camera at the barcode or Q R code. Hold steady, I will read it for you.');
  var v=document.getElementById('cam-vid');
  var c=document.createElement('canvas');
  codeScanTimer=setInterval(async function(){
    if(!camStream||!v.videoWidth)return;
    c.width=v.videoWidth;c.height=v.videoHeight;
    c.getContext('2d').drawImage(v,0,0);
    try{
      if(codeDetector){
        var found=await codeDetector.detect(c);
        if(found&&found.length)handleCodeResult(found[0].rawValue,normFmt(found[0].format));
      }else if(zxingReader){
        var r;
        if(typeof zxingReader.decodeFromCanvas==='function')r=zxingReader.decodeFromCanvas(c);
        else r=await zxingReader.decodeFromImageUrl(c.toDataURL('image/png'));
        if(r)handleCodeResult(r.getText(),normFmt(ZXing.BarcodeFormat[r.getBarcodeFormat()]));
      }
    }catch(e){/* no code in this frame — keep looking */}
  },400);
}
function stopCodeScan(){if(codeScanTimer){clearInterval(codeScanTimer);codeScanTimer=null;}}
function handleCodeResult(value,fmt){
  var now=Date.now();
  if(value===lastCodeValue&&now-lastCodeTime<4000)return; // same code, ignore repeats
  lastCodeValue=value;lastCodeTime=now;
  stopCodeScan(); // one code at a time — tap Read a Code again for the next one
  if(navigator.vibrate)navigator.vibrate(120);
  var info=translateCode(value,fmt);
  lastScan=info;
  document.getElementById('code-fmt').textContent=CODE_FMT_LABELS[fmt]||CODE_FMT_LABELS.unknown;
  document.getElementById('code-text').textContent=info.display;
  document.getElementById('code-explain').textContent=info.explain;
  var btns='';
  if(info.kind==='url')btns+='<button class="bb gm" onclick="codeActOpen()" style="min-height:42px;font-size:12px"><div class="f"></div><span>🌐 Open This Website</span></button>';
  if(info.kind==='tel'||info.phone)btns+='<button class="bb gf" onclick="codeActCall()" style="min-height:42px;font-size:12px"><div class="f"></div><span>📞 Call This Number</span></button>';
  if(info.kind==='email')btns+='<button class="bb gm" onclick="codeActEmail()" style="min-height:42px;font-size:12px"><div class="f"></div><span>📧 Write Them an Email</span></button>';
  if(info.kind==='geo')btns+='<button class="bb gm" onclick="codeActMaps()" style="min-height:42px;font-size:12px"><div class="f"></div><span>🗺️ Open in Maps</span></button>';
  if(info.kind==='wifi')btns+='<button class="bb gm" onclick="codeActCopyWifi()" style="min-height:42px;font-size:12px"><div class="f"></div><span>📋 Copy WiFi Password</span></button>';
  btns+='<button class="bb gp" onclick="codeActSpeak()" style="min-height:42px;font-size:12px"><div class="f"></div><span>🔊 Read It Aloud Again</span></button>';
  btns+='<button class="bb go" onclick="codeActCopy()" style="min-height:42px;font-size:12px;margin-bottom:0"><div class="f"></div><span>📋 Copy</span></button>';
  // If this code isn't a medicine packaging code (e.g. a pharmacy sign-up QR or Rx-number
  // barcode on a dispensed bottle), the code can't tell us the drug — offer typing the name.
  if(info.kind!=='product'){
    btns+='<button class="bb gf" onclick="switchTab(\'medicine\');setTimeout(function(){var i=document.getElementById(\'med-inp\');if(i){i.focus();i.scrollIntoView({block:\'center\'});}},250)" style="min-height:44px;font-size:12px;margin-top:2px;margin-bottom:0"><div class="f"></div><span>💊 That\'s not the medicine — add it by name</span></button>';
  }
  document.getElementById('code-actions').innerHTML=btns;
  document.getElementById('code-res').classList.add('show');
  speak(info.speech);
  if(typeof logEvent==='function')logEvent('code_scanned',{format:fmt,kind:info.kind});
  if(typeof fireIft==='function')fireIft('code_scanned',fmt,info.kind);
  // Medicine bottles: product codes get an automatic FDA drug lookup
  if(info.kind==='product')lookupDrugByCode(info.digits);
}
function translateCode(value,fmt){
  var v=String(value).trim();
  var info={kind:'text',raw:v,display:v,explain:'',speech:'',phone:null};
  var digits=v.replace(/\D/g,'');
  // GS1 DataMatrix / GS1-128 (pharmacy & hospital packaging): (01) = the product number
  var gs1=v.match(/^\]?[dC]?[12]?\(?01\)?(\d{14})/)||v.match(/^01(\d{14})/);
  if((fmt==='data_matrix'||fmt==='code_128'||fmt==='rss_14')&&gs1){
    info.kind='product';info.digits=gs1[1];
    info.display=v.length>60?v.slice(0,60)+'…':v;
    info.explain='This is a medicine or product packaging code. Checking the FDA medicine database now…';
    info.speech='I found a packaging code, the kind used on medicine. Let me check what it is.';
    return info;
  }
  if(/^(https?:\/\/|www\.)/i.test(v)){
    info.kind='url';info.url=/^www\./i.test(v)?'https://'+v:v;
    var host='';try{host=new URL(info.url).hostname.replace(/^www\./,'');}catch(e){host=v.slice(0,40);}
    info.display=v;
    info.explain='This is a link to the website "'+host+'". Tap the button below to open it — or ignore it if you don\'t know who it\'s from.';
    info.speech='This code is a link to the website '+host+'. If you trust it, tap Open This Website.';
  }else if(/^tel:/i.test(v)){
    info.kind='tel';info.phone=v.replace(/^tel:/i,'');info.display=info.phone;
    info.explain='This is a phone number: '+info.phone;
    info.speech='This code is a phone number: '+info.phone.replace(/(\d)/g,'$1 ')+'. Tap Call This Number to dial it.';
  }else if(/^smsto?:/i.test(v)){
    info.kind='tel';info.phone=v.replace(/^smsto?:/i,'').split(':')[0];info.display=info.phone;
    info.explain='This is a number to text or call: '+info.phone;
    info.speech='This code holds a phone number for texting: '+info.phone.replace(/(\d)/g,'$1 ');
  }else if(/^mailto:/i.test(v)||/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)){
    info.kind='email';info.email=v.replace(/^mailto:/i,'').split('?')[0];info.display=info.email;
    info.explain='This is an email address: '+info.email;
    info.speech='This code is an email address: '+info.email+'.';
  }else if(/^WIFI:/i.test(v)){
    info.kind='wifi';
    var ssid=(v.match(/S:([^;]*)/i)||[])[1]||'unknown';
    var pass=(v.match(/P:([^;]*)/i)||[])[1]||'';
    info.ssid=ssid;info.pass=pass;
    info.display='WiFi network: '+ssid;
    info.explain='This connects you to the WiFi network "'+ssid+'".'+(pass?' Password: '+pass:' No password needed.');
    info.speech='This is a WiFi sign-in code for the network '+ssid+'.'+(pass?' I can copy the password for you.':'');
  }else if(/^geo:/i.test(v)){
    info.kind='geo';var ll=v.replace(/^geo:/i,'').split('?')[0];info.latlon=ll;
    info.display='Map location: '+ll;
    info.explain='This is a place on the map.';
    info.speech='This code is a map location. Tap Open in Maps to see it.';
  }else if(/^(BEGIN:VCARD|MECARD:)/i.test(v)){
    info.kind='contact';
    var name=(v.match(/^FN[^:\r\n]*:(.+)$/im)||v.match(/MECARD:.*?N:([^;]+)/i)||v.match(/^N:([^;\r\n]+)/im)||[])[1]||'';
    var ph=(v.match(/TEL[^:\r\n]*:([+\d\-\s().]{7,})/i)||[])[1]||'';
    info.phone=ph?ph.trim():null;
    info.display=(name?name.trim():'A contact card')+(ph?' · '+ph.trim():'');
    info.explain='This is a contact card'+(name?' for '+name.trim():'')+'.'+(ph?' Phone: '+ph.trim():'');
    info.speech='This code is a contact card'+(name?' for '+name.trim():'')+'.'+(ph?' It includes a phone number you can call.':'');
  }else if(/^\d+$/.test(v)&&(v.length===8||v.length===12||v.length===13||v.length===14)){
    info.kind='product';info.digits=v;
    info.display=v;
    info.explain='This is a product barcode — the kind printed on groceries and medicine bottles. Checking the FDA medicine database now…';
    info.speech='This is a product barcode. Give me a moment to check if it is a medicine.';
  }else if(/^[+\d\-\s().]{7,16}$/.test(v)&&digits.length>=7&&digits.length<=11){
    info.kind='tel';info.phone=v;info.display=v;
    info.explain='This looks like a phone number: '+v;
    info.speech='This code looks like a phone number: '+digits.replace(/(\d)/g,'$1 ');
  }else{
    info.display=v.length>120?v.slice(0,120)+'…':v;
    info.explain='The code says: "'+(v.length>200?v.slice(0,200)+'…':v)+'"'+(fmt==='code_128'||fmt==='code_39'?' — this may be a pharmacy or package tracking number.':'');
    info.speech='The code says: '+v.slice(0,160);
  }
  return info;
}
// ── FDA medicine lookup (openFDA, free, no key) ──
async function lookupDrugByCode(digits){
  var ex=document.getElementById('code-explain');
  var cands=[];
  var d=String(digits||'');
  if(d.length===14){cands.push(d.slice(1),d.slice(2),d.slice(1,13));}
  if(d.length===13){cands.push(d,d.slice(1),'0'+d);}
  if(d.length===12){cands.push(d,'0'+d);}
  if(d.length===8){cands.push(d);}
  // NDC hyphenation candidates from the 10 digits inside a GTIN (positions 4–13)
  if(d.length===14){var n=d.slice(3,13);cands.push('NDC:'+n.slice(0,4)+'-'+n.slice(4,8)+'-'+n.slice(8),'NDC:'+n.slice(0,5)+'-'+n.slice(5,8)+'-'+n.slice(8),'NDC:'+n.slice(0,5)+'-'+n.slice(5,9)+'-'+n.slice(9));}
  cands=cands.filter(function(x,i){return x&&cands.indexOf(x)===i;});
  for(var i=0;i<cands.length;i++){
    var cand=cands[i];
    var q=cand.indexOf('NDC:')===0
      ?'https://api.fda.gov/drug/ndc.json?search=packaging.package_ndc:%22'+cand.slice(4)+'%22&limit=1'
      :'https://api.fda.gov/drug/ndc.json?search=openfda.upc:%22'+cand+'%22&limit=1';
    try{
      var r=await fetch(q);
      if(!r.ok)continue;
      var data=await r.json();
      var hit=data.results&&data.results[0];
      if(hit){
        var brand=hit.brand_name||hit.generic_name||'Unknown medicine';
        var gen=hit.generic_name&&hit.generic_name!==hit.brand_name?' ('+hit.generic_name+')':'';
        var form=hit.dosage_form?(' · '+String(hit.dosage_form).toLowerCase()):'';
        var strength=(hit.active_ingredients&&hit.active_ingredients[0]&&hit.active_ingredients[0].strength)?' · '+hit.active_ingredients[0].strength:'';
        var maker=hit.labeler_name?(' · Made by '+hit.labeler_name):'';
        lastScan.medName=brand;
        lastScan.medDose=(hit.active_ingredients&&hit.active_ingredients[0]&&hit.active_ingredients[0].strength)||'';
        ex.innerHTML='💊 <strong style="color:var(--green);font-size:14px">'+brand+gen+'</strong><span style="color:var(--sub)">'+strength+form+maker+'</span>';
        var addBtn=document.createElement('button');
        addBtn.className='bb gf';addBtn.style.cssText='min-height:42px;font-size:12px';
        addBtn.innerHTML='<div class="f"></div><span>➕ Add '+brand+' to My Medications</span>';
        addBtn.onclick=codeActAddMed;
        document.getElementById('code-actions').prepend(addBtn);
        speak('I found it! This is '+brand+gen+'. '+(lastScan.medDose?'Strength: '+lastScan.medDose+'. ':'')+'You can add it to your medication list with one tap.');
        if(typeof logEvent==='function')logEvent('medicine_identified',{name:brand});
        return;
      }
    }catch(e){
      ex.textContent='This is a product barcode: '+d+'. I could not reach the medicine database — check your internet and try again.';
      return;
    }
  }
  ex.textContent='This is a product barcode: '+d+'. It is not in the FDA medicine database — it may be a grocery or household product.';
  speak('I read the barcode, but it is not in the medicine database. It may be a regular store product.');
}
// ── Code result actions — all work from the last scan, no retyping ──
function codeActOpen(){if(lastScan&&lastScan.url){window.open(lastScan.url,'_blank');showToast('🌐 Opening website…');}}
function codeActCall(){if(lastScan&&lastScan.phone){var p=lastScan.phone;showToast('☎ Calling '+p+'…');speak('Calling '+p.replace(/(\d)/g,'$1 ')+'.');try{window.location.href='tel:'+p.replace(/[^\d+]/g,'');}catch(e){}}}
function codeActEmail(){if(lastScan&&lastScan.email)window.location.href='mailto:'+lastScan.email;}
function codeActMaps(){if(lastScan&&lastScan.latlon)window.open('https://maps.google.com/?q='+encodeURIComponent(lastScan.latlon),'_blank');}
function codeActCopyWifi(){if(lastScan&&lastScan.pass!==undefined){var t=lastScan.pass||lastScan.ssid;if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>showToast('📋 WiFi password copied!')).catch(()=>showToast('Could not copy'));}}
function codeActCopy(){if(lastScan&&navigator.clipboard)navigator.clipboard.writeText(lastScan.raw).then(()=>showToast('📋 Copied!')).catch(()=>showToast('Could not copy'));}
function codeActSpeak(){if(lastScan)speak(lastScan.speech+' '+(lastScan.kind==='text'?'':lastScan.explain||''));}
function codeActAddMed(){
  if(!lastScan||!lastScan.medName)return;
  switchTab('medicine');
  document.getElementById('med-inp').value=lastScan.medName;
  if(lastScan.medDose)document.getElementById('med-dose').value=lastScan.medDose;
  showToast('💊 '+lastScan.medName+' filled in — add times, then tap Add');
  speak(lastScan.medName+' is filled in for you. Add the reminder times, then tap Add Medication.');
}

// ════════════════════════════════════════════════════════════════
// ═══ STEADY TOUCH — tremor double-tap guard + practice pad ═══
// A shaky hand can land one tap as two or three. This guard counts only the
// FIRST tap on a button; repeats on the same button inside the window are
// swallowed before any onclick runs. Repeat-tap controls (dial pad, thermostat
// arrows, sliders) are exempt because double-tapping those is intentional.
// ════════════════════════════════════════════════════════════════
var TREMOR_KEY='totavivo_tremor_v1';
var tremorGuard={on:true,win:600};
var tremorStats={counted:0,blocked:0};
var _ttLastEl=null,_ttLastT=0;
var TREMOR_EXEMPT='.dp-key,.sh-tbtn,.cal-nav,.zsl,.vsl,.fsl,.sh-dimmer,input,textarea,select';
function loadTremor(){try{var s=TotaStorage.getItem(TREMOR_KEY);if(s)Object.assign(tremorGuard,JSON.parse(s));}catch(e){}updateTremorUI();}
function saveTremor(){try{TotaStorage.setItem(TREMOR_KEY,JSON.stringify(tremorGuard));}catch(e){}}
function updateTremorUI(){
  var tog=document.getElementById('tog-tremor');if(tog)tog.classList.toggle('on',tremorGuard.on);
  var opts=document.querySelectorAll('#tremor-grid .delay-opt');
  var idx={300:0,600:1,1000:2,1500:3}[tremorGuard.win];
  opts.forEach(function(d,i){d.classList.toggle('active',i===idx);});
}
function toggleTremorGuard(el){tremorGuard.on=!tremorGuard.on;el.classList.toggle('on',tremorGuard.on);saveTremor();showToast(tremorGuard.on?'🤚 Steady Touch ON — extra taps filtered':'Steady Touch OFF');speak(tremorGuard.on?'Steady touch is on. I will ignore accidental double taps.':'Steady touch is off.');if(typeof logEvent==='function')logEvent('tremor_guard_toggled',{on:tremorGuard.on});}
// ═══ BIG TEXT ═══
var BIGTEXT_KEY='totavivo_bigtext';
function toggleBigText(el){
  var on=!document.body.classList.contains('big-text');
  document.body.classList.toggle('big-text',on);
  el.classList.toggle('on',on);
  try{TotaStorage.setItem(BIGTEXT_KEY,on?'1':'0');}catch(e){}
  showToast(on?'🔤 Big Text ON':'Big Text OFF');
  speak(on?'Big text is on.':'Big text is off.');
  if(typeof logEvent==='function')logEvent('big_text_toggled',{on:on});
}
function loadBigText(){
  try{
    if(TotaStorage.getItem(BIGTEXT_KEY)==='1'){
      document.body.classList.add('big-text');
      var tog=document.getElementById('tog-bigtext');if(tog)tog.classList.add('on');
    }
  }catch(e){}
}
function setTremorWin(ms,el){tremorGuard.win=ms;document.querySelectorAll('#tremor-grid .delay-opt').forEach(d=>d.classList.remove('active'));el.classList.add('active');saveTremor();showToast('⏱️ Steady Touch window: '+(ms/1000)+' seconds');if(typeof logEvent==='function')logEvent('tremor_window_changed',{ms:ms});}
document.addEventListener('click',function(e){
  if(!tremorGuard.on)return;
  if(e.target.closest&&e.target.closest(TREMOR_EXEMPT))return;
  var t=e.target.closest?e.target.closest('button,[onclick],.tog,.app-tile,.earn-task,.cal-day,.contact-item,.email-item'):null;
  if(!t)return;
  var now=Date.now();
  if(t===_ttLastEl&&(now-_ttLastT)<tremorGuard.win){
    e.stopPropagation();e.preventDefault();
    tremorStats.blocked++;
    flashTremorPad(true);
    return;
  }
  _ttLastEl=t;_ttLastT=now;
},true);
function tremorPadTap(){tremorStats.counted++;flashTremorPad(false);}
function flashTremorPad(blocked){
  var s=document.getElementById('tremor-stats');
  if(s){
    s.textContent='Taps counted: '+tremorStats.counted+' · Shakes ignored: '+tremorStats.blocked;
    s.style.color=blocked?'var(--yellow)':'var(--green)';
    setTimeout(function(){s.style.color='var(--text)';},350);
  }
}
function resetTremorPad(){tremorStats.counted=0;tremorStats.blocked=0;var s=document.getElementById('tremor-stats');if(s){s.textContent='Taps counted: 0 · Shakes ignored: 0';s.style.color='var(--text)';}}

// ═══ THEME ═══
function setTheme(n,tid){document.body.className=n+(document.body.classList.contains('web-mode')?' web-mode':'');document.querySelectorAll('.thm-tile').forEach(t=>t.classList.remove('active'));document.getElementById(tid).classList.add('active');showToast('Theme updated!');showSyncIndicator();}

// ═══ UPDATE ═══
var UPD_DISMISS_KEY='totavivo_upd_dismissed';
function openUpdateAndDismiss(){
  showUpdate();
  // Hide the home banner now that user has seen it
  var btn=document.getElementById('upd-home-btn');
  if(btn)btn.style.display='none';
  try{TotaStorage.setItem(UPD_DISMISS_KEY,'1');}catch(e){}
}
function applyUpdateDismiss(){try{if(TotaStorage.getItem(UPD_DISMISS_KEY)==='1'){var btn=document.getElementById('upd-home-btn');if(btn)btn.style.display='none';}}catch(e){}}
function dismissHomeCard(id){var el=document.getElementById(id);if(el){el.style.transition='opacity .25s';el.style.opacity='0';setTimeout(()=>el.style.display='none',250);}showToast('Dismissed');if(typeof logEvent==='function')logEvent('home_card_dismissed',{id:id});try{var dismissed=JSON.parse(TotaStorage.getItem('totavivo_dismissed_cards')||'[]');if(dismissed.indexOf(id)<0){dismissed.push(id);TotaStorage.setItem('totavivo_dismissed_cards',JSON.stringify(dismissed));}}catch(e){}}
function applyDismissedHomeCards(){try{var dismissed=JSON.parse(TotaStorage.getItem('totavivo_dismissed_cards')||'[]');dismissed.forEach(id=>{var el=document.getElementById(id);if(el)el.style.display='none';});}catch(e){}}

// ════════════════════════════════════════════════════════════════
// ═══ HOME BALANCE TILES — Income · Bills · Left ═══
// ════════════════════════════════════════════════════════════════
var BAL_KEY='totavivo_balance_dests_v1';
var balanceState={
  income:{value:2840, dest:'bank',     label:'Income', max:5000},
  bills: {value:1920, dest:'bills',    label:'Bills',  max:5000},
  left:  {value:920,  dest:'checking', label:'Left',   max:3000},
};
function loadBalanceDests(){try{var s=TotaStorage.getItem(BAL_KEY);if(!s)return;var d=JSON.parse(s);Object.keys(d).forEach(k=>{if(balanceState[k]&&d[k].dest)balanceState[k].dest=d[k].dest;});}catch(e){}}
function saveBalanceDests(){try{var out={};Object.keys(balanceState).forEach(k=>{out[k]={dest:balanceState[k].dest};});TotaStorage.setItem(BAL_KEY,JSON.stringify(out));}catch(e){}}
function tapBalanceTile(which){
  var dest=balanceState[which].dest;
  if(typeof logEvent==='function')logEvent('balance_tile_tapped',{tile:which,dest:dest});
  switchTab(dest);
}
function editBalanceTile(which){
  var current=balanceState[which].dest;
  var opts=[
    {id:'bank',     name:'🏦 Bank Statement'},
    {id:'checking', name:'💵 Checking Account'},
    {id:'bills',    name:'💳 Bills'},
    {id:'earn',     name:'💰 Earn'},
    {id:'insights', name:'📊 Insights'},
    {id:'home',     name:'🏠 Home'},
  ];
  var msg='Where should "'+balanceState[which].label+'" take you?\n\n'
    +opts.map((o,i)=>(i+1)+'. '+o.name+(o.id===current?' ✓':'')).join('\n')
    +'\n\nType a number (1-'+opts.length+') and press OK:';
  var pick=prompt(msg, opts.findIndex(o=>o.id===current)+1);
  if(!pick)return;
  var idx=parseInt(pick,10)-1;
  if(idx>=0&&idx<opts.length){
    balanceState[which].dest=opts[idx].id;
    saveBalanceDests();
    showToast('✓ "'+balanceState[which].label+'" → '+opts[idx].name);
    if(typeof logEvent==='function')logEvent('balance_tile_remapped',{tile:which,dest:opts[idx].id});
  }
}
function renderWeather(){
  var h=document.getElementById('w-hourly');if(!h)return;
  var hours=[{t:'NOW',i:'⛅',d:'84°'},{t:'1PM',i:'☀️',d:'85°'},{t:'2PM',i:'☀️',d:'86°'},{t:'3PM',i:'⛅',d:'85°'},{t:'4PM',i:'🌦',d:'82°'},{t:'5PM',i:'🌧',d:'78°'},{t:'6PM',i:'⛅',d:'75°'},{t:'7PM',i:'🌙',d:'72°'}];
  h.innerHTML=hours.map(c=>'<div class="wh-cell"><div class="wh-t">'+c.t+'</div><div class="wh-i">'+c.i+'</div><div class="wh-d">'+c.d+'</div></div>').join('');
}

// ════════════════════════════════════════════════════════════════
// ═══ LOCATION CONTEXT — GPS or ZIP override, drives weather + caregiver location
// ════════════════════════════════════════════════════════════════
var LOC_KEY='totavivo_location_pref_v1';
var currentCity='Orlando, FL';
function loadLocationPref(){
  try{
    var s=TotaStorage.getItem(LOC_KEY);
    if(!s)return;
    var d=JSON.parse(s);
    if(d&&d.city){currentCity=d.city;updateWeatherUI(currentCity);}
    if(d&&d.zip){var inp=document.getElementById('pref-zipcode');if(inp)inp.value=d.zip;var gps=document.getElementById('btn-gps-auto');if(gps)gps.classList.remove('on');}
  }catch(e){}
}
function saveLocationPref(city,zip){try{TotaStorage.setItem(LOC_KEY,JSON.stringify({city:city||currentCity,zip:zip||''}));}catch(e){}}
function setLocationStatus(msg){var el=document.getElementById('location-status-msg');if(el)el.textContent=msg;}

function enableLiveGPS(){
  var inp=document.getElementById('pref-zipcode');if(inp)inp.value='';
  try{TotaStorage.removeItem('totavivo_pref_zip');}catch(e){}
  var gps=document.getElementById('btn-gps-auto');if(gps)gps.classList.add('on');
  if(!navigator.geolocation){showToast('❌ GPS not supported on this device');setLocationStatus('GPS not available · sandbox fallback');return;}
  setLocationStatus('🛰️ Querying GPS satellites…');
  if(typeof logEvent==='function')logEvent('location_gps_requested');
  navigator.geolocation.getCurrentPosition(async pos=>{
    var lat=pos.coords.latitude, lon=pos.coords.longitude;
    try{
      var r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+lat+'&longitude='+lon+'&localityLanguage=en');
      var d=await r.json();
      var city=d.city||d.locality||'Unknown';
      var state=d.principalSubdivisionCode?d.principalSubdivisionCode.split('-')[1]:(d.principalSubdivision||'');
      currentCity=state?(city+', '+state):city;
      updateWeatherUI(currentCity);
      saveLocationPref(currentCity,'');
      showToast('📍 GPS: '+currentCity);
      if(typeof logEvent==='function')logEvent('location_gps_resolved',{city:currentCity,acc:Math.round(pos.coords.accuracy)});
    }catch(err){
      setLocationStatus('⚠️ Reverse-geocode failed · using fallback');
      updateWeatherUI('Orlando, FL');
    }
  },err=>{
    setLocationStatus('⚠️ GPS permission denied · using sandbox profile');
    updateWeatherUI('Orlando, FL');
    if(typeof logEvent==='function')logEvent('location_gps_denied',{code:err.code});
  },{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
}

function handleZipOverride(val){
  var clean=(val||'').replace(/\D/g,'').substring(0,5);
  var inp=document.getElementById('pref-zipcode');if(inp&&inp.value!==clean)inp.value=clean;
  if(clean.length===5){
    var gps=document.getElementById('btn-gps-auto');if(gps)gps.classList.remove('on');
    fetchLocationByZip(clean);
  }else if(clean.length===0){
    setLocationStatus('Tracking Profile: Sandbox Default (Orlando, FL)');
  }
}

async function fetchLocationByZip(zip){
  setLocationStatus('🔍 Looking up ZIP '+zip+'…');
  if(typeof logEvent==='function')logEvent('location_zip_lookup',{zip:zip});
  try{
    var r=await fetch('https://api.zippopotam.us/us/'+zip);
    if(!r.ok)throw new Error('Invalid ZIP');
    var d=await r.json();
    var p=d.places[0];
    currentCity=p['place name']+', '+p['state abbreviation'];
    updateWeatherUI(currentCity);
    saveLocationPref(currentCity,zip);
    showToast('📍 '+currentCity);
    if(typeof logEvent==='function')logEvent('location_zip_resolved',{zip:zip,city:currentCity});
  }catch(err){
    setLocationStatus('⚠️ Unknown ZIP code · keeping current city');
    if(typeof logEvent==='function')logEvent('location_zip_failed',{zip:zip});
  }
}

function updateWeatherUI(cityLabelText){
  if(cityLabelText)currentCity=cityLabelText;
  setLocationStatus('📌 Fixed Reference: '+currentCity);
  var wc=document.getElementById('weather-city-label');
  if(wc)wc.textContent='Partly Sunny · '+currentCity;
}

function speakWeather(){
  speak('Today in '+currentCity+': partly sunny, high of 84, low of 68. 10 percent chance of rain.');
  if(typeof logEvent==='function')logEvent('weather_spoken',{city:currentCity});
}
function highlightBill(){
  var row=document.querySelector('#s-bills .billrow');
  if(!row)return;
  row.style.transition='background .3s';
  row.style.background='rgba(255,209,102,.18)';
  row.style.borderRadius='8px';
  setTimeout(()=>{row.style.background='';},2200);
}
function renderBalanceTiles(){
  // Live-fill: bar height = (value / max) %. Each tile shows the dollar value + "% of $max" caption.
  ['income','bills','left'].forEach(k=>{
    var bar=document.getElementById('bar-'+k);
    var amtEl=document.getElementById('amt-'+k);
    var pctEl=document.getElementById('pct-'+k);
    if(!bar)return;
    var s=balanceState[k];
    var pct=Math.max(4,Math.min(96, Math.round(s.value/s.max*100)));
    // Animate from 0 → target so the growth is visibly proportional to the dollar amount.
    // .bc2-bar already has a CSS height transition, so we reset to 0, force a reflow to commit
    // it, then set the target — the CSS does the animating. (The old version used nested
    // requestAnimationFrame, which NEVER fires while the page is hidden/backgrounded, leaving
    // the bars stuck empty at 0% when the app was re-rendered in the background.)
    bar.style.height='0%';
    void bar.offsetHeight; // force reflow — commits the 0% before we transition to pct
    bar.style.height=pct+'%';
    if(amtEl)amtEl.textContent='$'+s.value.toLocaleString(undefined,s.value%1?{minimumFractionDigits:2,maximumFractionDigits:2}:{}); // cents shown as .40, never .4
    if(pctEl){var maxK=s.max>=1000?Math.round(s.max/1000)+'K':s.max;pctEl.textContent=pct+'% of $'+maxK;}
  });
}
// ════════════════════════════════════════════════════════════════
// ═══ ONE CONNECTED (DEMO) LEDGER — bills, deposits, balances, button fills ═══
// balanceState is the single source of truth. Everything below reads from it so the Bank,
// Checking, Bill Hub and Home bars can never drift apart. All figures are sample data.
// ════════════════════════════════════════════════════════════════
function fmtMoney(n){n=Number(n)||0;return '$'+n.toLocaleString(undefined,(n%1)?{minimumFractionDigits:2,maximumFractionDigits:2}:{});}
function moneyNum(txt){return parseFloat(String(txt||'').replace(/[^0-9.]/g,''))||0;}
// A Pay button is a gauge: fill height = this bill as a share of Money Left.
function payLevel(dollars){
  var left=(typeof balanceState!=='undefined')?balanceState.left.value:0;
  if(!(dollars>0))return {cls:'pn2',pct:8};
  if(left<=0)return {cls:'pu2',pct:96};
  var share=dollars/left;
  return {cls:share>=0.5?'pu2':(share>=0.25?'pw2':'pn2'),pct:Math.max(8,Math.min(96,Math.round(share*100)))};
}
function refreshPayButtons(){
  var tot=document.getElementById('bills-total');if(!tot)return;
  var card=tot.closest('.card');if(!card)return;
  card.querySelectorAll('.billrow').forEach(function(row){
    var btn=row.querySelector('.pbtn');if(!btn||btn.disabled)return; // paid/scheduled stay grey
    var d=moneyNum((row.querySelector('.bamt')||{}).textContent);
    var lv=payLevel(d);
    btn.className='pbtn '+lv.cls;
    btn.style.setProperty('--fill',lv.pct+'%');
    btn.title=fmtMoney(d)+' = '+lv.pct+'% of your '+fmtMoney(balanceState.left.value)+' left';
  });
}
function billsTotalFromRows(){
  var tot=document.getElementById('bills-total');if(!tot)return 0;
  var card=tot.closest('.card');if(!card)return 0;
  var sum=0;
  card.querySelectorAll('.billrow .bamt').forEach(function(a){sum+=moneyNum(a.textContent);});
  return Math.round(sum*100)/100;
}
function renderMoneyScreens(){
  if(typeof balanceState==='undefined')return;
  var inc=balanceState.income.value,bil=balanceState.bills.value,left=balanceState.left.value,e;
  e=document.getElementById('chk-income');if(e)e.textContent='+'+fmtMoney(inc);
  e=document.getElementById('chk-bills');if(e)e.textContent='−'+fmtMoney(bil);
  e=document.getElementById('chk-left');if(e)e.textContent=fmtMoney(left);
  e=document.getElementById('checking-balance');if(e)e.textContent=fmtMoney(left).replace('$','');
  e=document.getElementById('bank-income-total');if(e)e.textContent=fmtMoney(inc).replace('$','');
  e=document.getElementById('bills-total');if(e)e.textContent=fmtMoney(billsTotalFromRows());
  if(typeof renderBalanceTiles==='function')renderBalanceTiles();
  refreshPayButtons();
}
function addBillRow(vendor,dollars,dueTxt,icon){
  var tot=document.getElementById('bills-total');if(!tot)return null;
  var card=tot.closest('.card');
  var totalRow=card.querySelector('.trow');
  var amtTxt=fmtMoney(dollars);
  var row=document.createElement('div');row.className='billrow';
  row.innerHTML='<div class="bic">'+esc(icon||'🧾')+'</div><div class="bil"><div class="bn">'+esc(vendor)+'</div><div class="bd">'+esc(dueTxt||'Added by you')+'</div></div><span class="bamt">'+esc(amtTxt)+'</span>'+
    '<button class="pbtn pn2" onclick="payBill(this,\''+escJs(vendor)+'\',\''+escJs(amtTxt)+'\')"><span>Pay</span></button>';
  if(totalRow)card.insertBefore(row,totalRow);else card.appendChild(row);
  renderMoneyScreens();
  return row;
}
function addBillManual(){
  var name=(document.getElementById('bill-name').value||'').trim();
  var amt=moneyNum(document.getElementById('bill-amt').value);
  var due=(document.getElementById('bill-due').value||'').trim();
  if(!name){showToast('Type who the bill is for');speak('Please type who the bill is for.');return;}
  if(!(amt>0)){showToast('Type how much the bill is');speak('Please type how much the bill is.');return;}
  addBillRow(name,amt,due?('Due '+due):'Added by you','🧾');
  ['bill-name','bill-amt','bill-due'].forEach(function(id){document.getElementById(id).value='';});
  var lv=payLevel(amt);
  var msg=lv.cls==='pu2'?'That is most of the money you have left.':(lv.cls==='pw2'?'That is a big chunk of your money left.':'That fits comfortably.');
  showToast('💳 '+name+' '+fmtMoney(amt)+' added — '+msg);
  speak(name+' bill for '+Math.round(amt)+' dollars added. '+msg+' Look at how full its Pay button is.');
  if(typeof logEvent==='function')logEvent('bill_added_manual',{amount:amt});
}
function addDepositManual(){
  var name=(document.getElementById('dep-name').value||'').trim();
  var amt=moneyNum(document.getElementById('dep-amt').value);
  if(!name){showToast('Type where the money came from');speak('Please type where the money came from.');return;}
  if(!(amt>0)){showToast('Type how much the deposit is');speak('Please type how much the deposit is.');return;}
  balanceState.income.value=Math.round((balanceState.income.value+amt)*100)/100;
  balanceState.left.value=Math.round((balanceState.left.value+amt)*100)/100;
  var host=document.getElementById('bank-deposits');
  if(host){
    var row=document.createElement('div');row.className='billrow';
    row.innerHTML='<div class="bic">💵</div><div class="bil"><div class="bn">'+esc(name)+'</div><div class="bd">Added by you · today</div></div><span class="bamt" style="color:var(--green)">+'+esc(fmtMoney(amt))+'</span>';
    host.insertBefore(row,host.firstChild);
  }
  ['dep-name','dep-amt'].forEach(function(id){document.getElementById(id).value='';});
  renderMoneyScreens();
  showToast('💵 '+name+' +'+fmtMoney(amt)+' — Money Left is now '+fmtMoney(balanceState.left.value));
  speak(name+' deposit of '+Math.round(amt)+' dollars added. You now have '+Math.round(balanceState.left.value)+' dollars left. Watch the bars grow and the pay buttons drop.');
  if(typeof logEvent==='function')logEvent('deposit_added_manual',{amount:amt});
}
// ─── Color Vision Filter ───
var CF_KEY='totavivo_color_filter_v1';
var currentColorFilter='none';
function loadColorFilter(){try{currentColorFilter=TotaStorage.getItem(CF_KEY)||'none';applyColorFilter(currentColorFilter,true);}catch(e){}}
function applyColorFilter(cf,silent){
  document.body.classList.remove('cf-tritanopia','cf-protanopia','cf-deuteranopia');
  if(cf&&cf!=='none')document.body.classList.add('cf-'+cf);
  // Sync active state on the option buttons
  document.querySelectorAll('[data-cf]').forEach(b=>b.classList.toggle('active',b.dataset.cf===cf));
}
function setColorFilter(cf){
  currentColorFilter=cf;
  applyColorFilter(cf);
  try{TotaStorage.setItem(CF_KEY,cf);}catch(e){}
  var label={none:'True Color',tritanopia:'Tritanopia (Blue/Yellow)',protanopia:'Protanopia (Red weak)',deuteranopia:'Deuteranopia (Green weak)'}[cf]||cf;
  showToast('👁 '+label);
  speak(cf==='none'?'Color filter off. True color.':'Color filter set to '+label+'.');
  if(typeof logEvent==='function')logEvent('color_filter_changed',{filter:cf});
}
function showAboutTotaVivo(){
  document.getElementById('about-ov').classList.add('show');
  // Blank when still the placeholder persona — pre-filling "Dorothy" made it too easy to
  // dismiss the box and keep the demo name forever.
  var inp=document.getElementById('about-name-input');if(inp)inp.value=(seniorName==='Dorothy'?'':seniorName);
  var acct=document.getElementById('about-account-number');if(acct)acct.textContent=getAccountNumber();
  if(typeof logEvent==='function')logEvent('about_opened');
  speak('TotaVivo. Long live your whole life. Your life, your way, anytime.');
}
function showDedication(){var o=document.getElementById('ded-ov');if(o)o.classList.add('show');if(typeof logEvent==='function')logEvent('dedication_opened');}
function hideDedication(){var o=document.getElementById('ded-ov');if(o)o.classList.remove('show');}
function closeAbout(){
  var inp=document.getElementById('about-name-input');
  if(inp){
    var newName=inp.value.trim();
    if(newName&&newName!==seniorName){
      saveSeniorName(newName);
      showToast('✅ Got it — I\'ll call you '+newName+' from now on');
      speak('Nice to meet you, '+newName+'. Long live your whole life.');
      if(typeof logEvent==='function')logEvent('senior_name_changed',{});
    }
  }
  document.getElementById('about-ov').classList.remove('show');
}
// Fill-in-the-blank template — so a busy tester never has to figure out what to write,
// just answer what's already there. Opens their own mail app; nothing sent from here.
function openFeedbackEmail(){
  var subject='TotaVivo Feedback';
  var body='Hi Randy,\n\nHere are my thoughts on TotaVivo:\n\n'
    +'What I liked:\n\n\n'
    +'What was confusing or didn\'t work:\n\n\n'
    +'Who this could help (a patient type, if any comes to mind):\n\n\n'
    +'On a scale of 1-10, how likely am I to recommend this to a colleague?\n\n\n'
    +'Anything else:\n\n\n'
    +'Thanks!';
  if(typeof logEvent==='function')logEvent('feedback_email_opened',{});
  // Belt-and-suspenders, shown BEFORE the handoff attempt rather than after: a mailto: link on
  // a device with no mail app configured silently does nothing with zero sign of failure —
  // same "stuck with no feedback" pattern as the dialer bug. Showing the address up front means
  // it's already on screen no matter what happens with the navigation attempt that follows.
  showToast('📧 Opening your email app — or just send it to Randy_L@icloud.com');
  window.location.href='mailto:Randy_L@icloud.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}

// ═══ SETUP WIZARD — first run only. Asks each permission one at a time, with a real Allow/Not Now choice. ═══
var SETUP_DONE_KEY='totavivo_setup_completed';
var setupStepIndex=0;
var SETUP_STEPS=[
  {kind:'intro'},
  {kind:'disclaimer'},
  {kind:'perm',icon:'📷🎙',title:'Camera & Microphone',why:"Used for the magnifier, scanning medicine bottles, video calls, and talking to Vivo by voice. Nothing is recorded or saved — only used live, while you're using those features.",action:()=>{if(typeof requestCameraMic==='function')requestCameraMic();}},
  {kind:'perm',icon:'📍',title:'Location',why:"So Vivo can share where you are with your caregiver if you ever need the 911 Find-Me Beacon. Never shared otherwise.",action:()=>{if(typeof requestLocation==='function')requestLocation();}},
  {kind:'perm',icon:'🤸',title:'Motion & Fall Detection',why:"Lets TotaVivo notice a possible fall automatically using your phone's motion sensor, and check that you're okay. Also counts your steps for the Earn feature.",action:()=>{if(typeof requestMotion==='function')requestMotion();}},
  {kind:'perm',icon:'🔔',title:'Notifications',why:"So Vivo can remind you about medications, calls, and bills — even when TotaVivo isn't open.",action:()=>{if(typeof requestNotifPerm==='function')requestNotifPerm();}},
  {kind:'name'},
  {kind:'done'},
];
function maybeShowSetupWizard(){
  var done=false;
  try{done=TotaStorage.getItem(SETUP_DONE_KEY)==='1';}catch(e){}
  if(!done)setTimeout(startSetupWizard,600);
}
function startSetupWizard(){
  setupStepIndex=0;renderSetupStep();
  // The corner X only exists for re-runs from Settings. First run keeps the wizard
  // unskippable so the safety disclaimer is always seen before the app is used.
  var alreadyDone=false;try{alreadyDone=TotaStorage.getItem(SETUP_DONE_KEY)==='1';}catch(e){}
  var x=document.getElementById('setup-x');if(x)x.style.display=alreadyDone?'flex':'none';
  document.getElementById('setup-ov').classList.add('show');
}
function cancelSetupWizard(){
  document.getElementById('setup-ov').classList.remove('show');
  showToast('Setup closed — your existing settings are unchanged');
}
function renderSetupStep(){
  var s=SETUP_STEPS[setupStepIndex];
  var dots=document.getElementById('setup-dots');
  dots.innerHTML=SETUP_STEPS.map((_,i)=>'<span class="setup-dot'+(i===setupStepIndex?' active':'')+'"></span>').join('');
  var c=document.getElementById('setup-step-content');
  if(s.kind==='intro'){
    c.innerHTML='<div style="font-size:50px;margin-bottom:10px">👋</div><div class="setup-title">Welcome to TotaVivo</div><div class="setup-body">Let\'s get set up together — just a few quick questions. Skip anything you\'d rather not turn on; you can always change it later in Settings.</div><button class="bb gf" onclick="setupNext()" style="margin-top:16px;margin-bottom:0"><div class="f"></div><span>Let\'s Go →</span></button>';
  }else if(s.kind==='disclaimer'){
    c.innerHTML='<div style="font-size:44px;margin-bottom:8px">⚠️</div><div class="setup-title" style="color:var(--red)">Before You Begin</div>'
      +'<div class="setup-body" style="text-align:left;background:rgba(255,92,122,.08);border:1.5px solid rgba(255,92,122,.35);border-radius:12px;padding:12px 14px;margin-top:6px">'
      +'<b>In a real emergency, always call 911 directly.</b> TotaVivo\'s fall detection and 911 Find-Me Beacon are helpful supplemental tools — they are not a certified medical alert system and are not guaranteed to work every time. Medication reminders are informational only, not medical advice. Please don\'t rely on TotaVivo as your only emergency plan.'
      +'</div>'
      +'<div style="margin-top:10px"><a href="./disclaimer.html" target="_blank" style="font-size:11px;color:var(--a2);font-weight:700">Read the full Safety Disclaimer →</a></div>'
      +'<button class="bb gf" onclick="setupAcceptDisclaimer()" style="margin-top:14px;margin-bottom:0"><div class="f"></div><span>✅ I Understand and Agree</span></button>';
  }else if(s.kind==='perm'){
    c.innerHTML='<div style="font-size:50px;margin-bottom:10px">'+s.icon+'</div><div class="setup-title">'+esc(s.title)+'</div><div class="setup-body">'+esc(s.why)+'</div>'
      +'<button class="bb gf" onclick="setupAllow()" style="margin-top:16px;margin-bottom:7px"><div class="f"></div><span>✅ Allow</span></button>'
      +'<button class="bb gl" onclick="setupNext()" style="margin-bottom:0"><div class="f"></div><span>Not Now</span></button>';
  }else if(s.kind==='name'){
    c.innerHTML='<div style="font-size:50px;margin-bottom:10px">👋</div><div class="setup-title">Let\'s get to know each other</div><div class="setup-body">What should Vivo call you? Used everywhere TotaVivo speaks to you.</div>'
      +'<input class="form-inp" id="setup-name-input" type="text" placeholder="Your name" value="'+escAttr(seniorName==='Dorothy'?'':seniorName)+'" style="text-align:center;font-weight:800;font-size:16px;margin-top:12px">'
      +'<button class="bb gf" onclick="setupSaveName()" style="margin-top:12px;margin-bottom:0"><div class="f"></div><span>Continue →</span></button>';
  }else if(s.kind==='done'){
    c.innerHTML='<div style="font-size:50px;margin-bottom:10px">✨</div><div class="setup-title">You\'re all set!</div><div class="setup-body">Tap the 🎙️ microphone at the top anytime you need help. Long live your whole life.</div><button class="bb gf" onclick="finishSetupWizard()" style="margin-top:16px;margin-bottom:0"><div class="f"></div><span>Start Using TotaVivo</span></button>';
  }
}
function setupAllow(){var s=SETUP_STEPS[setupStepIndex];if(s.action)s.action();setupNext();}
function setupNext(){setupStepIndex++;if(setupStepIndex>=SETUP_STEPS.length){finishSetupWizard();return;}renderSetupStep();}
function setupSaveName(){var v=document.getElementById('setup-name-input').value.trim();if(v)saveSeniorName(v);setupNext();}
var DISCLAIMER_ACCEPTED_KEY='totavivo_disclaimer_accepted';
function setupAcceptDisclaimer(){
  var record={accepted:true,at:new Date().toISOString()};
  try{TotaStorage.setItem(DISCLAIMER_ACCEPTED_KEY,JSON.stringify(record));}catch(e){}
  if(typeof logEvent==='function')logEvent('disclaimer_accepted',record);
  setupNext();
}
function finishSetupWizard(){
  try{TotaStorage.setItem(SETUP_DONE_KEY,'1');}catch(e){}
  document.getElementById('setup-ov').classList.remove('show');
  speak('Welcome to TotaVivo, '+seniorName+'. Long live your whole life.');
  if(typeof logEvent==='function')logEvent('setup_wizard_completed',{});
}

function showUpdate(){document.getElementById('upd-ov').classList.add('show');startUpdCount();}
function dismissUpdate(){document.getElementById('upd-ov').classList.remove('show');clearInterval(updTimer);showToast('⏰ Reminder set for tomorrow');}
function startUpdCount(){clearInterval(updTimer);updTimer=setInterval(()=>{updCountdown.s--;if(updCountdown.s<0){updCountdown.s=59;updCountdown.m--;}if(updCountdown.m<0){updCountdown.m=59;updCountdown.h--;}if(updCountdown.h<0){updCountdown.h=23;updCountdown.d--;}if(updCountdown.d<0){clearInterval(updTimer);startUpdate();return;}var el=document.getElementById('ucdt');if(el)el.textContent=updCountdown.d+'d '+pad2(updCountdown.h)+':'+pad2(updCountdown.m)+':'+pad2(updCountdown.s);},1000);}
function startUpdate(){clearInterval(updTimer);document.getElementById('upd-now').innerHTML='<span>⬇️ Downloading…</span>';document.getElementById('upd-now').disabled=true;var prog=document.getElementById('upd-prog'),bar=document.getElementById('upd-bar'),lbl=document.getElementById('upd-lbl');prog.classList.add('show');lbl.style.display='block';var pct=0;var msgs=['Downloading '+APP_VERSION+'…','Installing apps hub…','Saving your voice settings…','Syncing all devices…','Complete!'];var mi=0;var t=setInterval(()=>{pct+=Math.random()*7+3;if(pct>100)pct=100;bar.style.width=pct+'%';lbl.textContent=msgs[Math.min(mi++,4)]+' '+Math.round(pct)+'%';if(pct>=100){clearInterval(t);lbl.textContent='✅ TotaVivo '+APP_VERSION+' installed!';setTimeout(()=>{document.getElementById('upd-ov').classList.remove('show');showToast('✅ TotaVivo '+APP_VERSION+' ready! Your voice settings were preserved.');speak('TotaVivo has been updated to version '+APP_VERSION+'. Your voice settings were preserved exactly as you set them. Long live your whole life, '+seniorName+'! Just tap my microphone anytime you need me.');loadVoiceSettings();},1800);}},200);}

// ═══ TOAST / UNDO ═══
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function showUndo(msg){document.getElementById('undo-msg').textContent=msg;document.getElementById('undo-bar').classList.add('show');if(undoTimer)clearTimeout(undoTimer);undoTimer=setTimeout(hideUndo,5000);}
function hideUndo(){document.getElementById('undo-bar').classList.remove('show');}
function undoAct(){if(!lastAction)return;if(lastAction.type==='pay'){lastAction.btn.querySelector('span').textContent='Pay';lastAction.btn.className='pbtn pn2';lastAction.btn.disabled=false;
    // Reverse the ledger move too, so Undo really undoes everything the payment changed
    if(typeof balanceState!=='undefined'&&lastAction.dollars){balanceState.bills.value=Math.max(0,Math.round((balanceState.bills.value-lastAction.dollars)*100)/100);balanceState.left.value=Math.round((balanceState.left.value+lastAction.dollars)*100)/100;if(typeof renderBalanceTiles==='function')renderBalanceTiles();}
    showToast('↩ Payment undone');}else if(lastAction.type==='delete_contact'){allContacts.splice(lastAction.index,0,lastAction.contact);renderContacts(currentContactFilter());if(typeof renderPhoneScreen==='function')renderPhoneScreen();showToast('↩ '+lastAction.contact.name+' restored');}lastAction=null;hideUndo();}

// ════════════════════════════════════════════════════════════════
// ═══ INSTRUMENTATION — automatic event logging & insights ═══
// ════════════════════════════════════════════════════════════════
// Central event logger. Stores locally, optionally forwards to IFTTT and/or a custom endpoint.
// Used by every interactive flow so we can answer: which features get used? where do users get stuck?
var INSTR_EVENTS_KEY='totavivo_events_v1';
var INSTR_SETTINGS_KEY='totavivo_instr_settings_v1';
var INSTR_MAX_EVENTS=5000;
var instrSettings={enabled:true,sendToIft:false,endpointUrl:''};
var sessionId='s_'+new Date().getTime().toString(36)+'_'+Math.floor(Math.random()*1e6).toString(36);
var sessionStart=new Date().getTime();
var lastEventTime={};   // for response-time computation
var eventCounter=0;     // session counter

function loadInstr(){try{var s=TotaStorage.getItem(INSTR_SETTINGS_KEY);if(s)Object.assign(instrSettings,JSON.parse(s));}catch(e){}}
function saveInstrSettings(){try{TotaStorage.setItem(INSTR_SETTINGS_KEY,JSON.stringify(instrSettings));}catch(e){}}

function logEvent(name,props){
  if(!instrSettings.enabled)return;
  var now=new Date().getTime();
  var ev={
    id:'e_'+now.toString(36)+'_'+(eventCounter++),
    name:name,
    props:props||{},
    t:now,
    iso:new Date(now).toISOString(),
    session:sessionId,
    sessionMs:now-sessionStart,
  };
  // Persist to TotaStorage (FIFO cap)
  try{
    var arr=JSON.parse(TotaStorage.getItem(INSTR_EVENTS_KEY)||'[]');
    arr.push(ev);
    if(arr.length>INSTR_MAX_EVENTS)arr=arr.slice(-INSTR_MAX_EVENTS);
    TotaStorage.setItem(INSTR_EVENTS_KEY,JSON.stringify(arr));
  }catch(e){}
  // Update timing markers
  lastEventTime[name]=ev.t;
  // Forward to IFTTT
  if(instrSettings.sendToIft&&typeof fireIft==='function'&&typeof iftKey!=='undefined'&&iftKey){
    try{fireIft('tv_'+name,JSON.stringify(props||{}),sessionId);}catch(e){}
  }
  // Forward to custom endpoint
  if(instrSettings.endpointUrl){
    try{fetch(instrSettings.endpointUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ev),keepalive:true}).catch(()=>{});}catch(e){}
  }
  // Forward caregiver-relevant events to the synced activity feed (opt-in, only when linked)
  if(typeof syncClient!=='undefined'&&syncClient&&typeof syncState!=='undefined'&&syncState.linked&&SYNC_ACTIVITY_EVENTS.indexOf(name)>=0){
    syncClient.from('activity_log').insert({household_id:syncState.householdId,event_type:name,detail:props||{}}).then(function(){});
  }
}
// Helper: log response time relative to a prior event
function logResponseTime(triggerName,responseName,extra){
  var dt=lastEventTime[triggerName]?Math.round((new Date().getTime()-lastEventTime[triggerName])/1000):null;
  logEvent(responseName,Object.assign({response_time_s:dt},extra||{}));
}
function getAllEvents(){try{return JSON.parse(TotaStorage.getItem(INSTR_EVENTS_KEY)||'[]');}catch(e){return[];}}
function clearAllEvents(){try{TotaStorage.removeItem(INSTR_EVENTS_KEY);}catch(e){}showToast('Events cleared');renderInsights();logEvent('events_cleared');}

// Beforeunload — flush a session_end event
window.addEventListener('beforeunload',()=>{try{logEvent('session_ended',{duration_s:Math.round((new Date().getTime()-sessionStart)/1000)});}catch(e){}});
// Page visibility — log background/foreground
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)logEvent('app_backgrounded');
  else logEvent('app_foregrounded');
});

// ════════════════════════════════════════════════════════════════
// ═══ DEVICE SENSORS — full integration with Web Sensor APIs ═══
// ════════════════════════════════════════════════════════════════
var sensorState={
  battery:null,
  network:null,
  location:null,
  motion:{enabled:false,maxG:0,lastSpike:0,lastValues:{ax:0,ay:0,az:0}},
  notifications:null,
  storage:null,
  camera:'unknown',
  microphone:'unknown',
  bluetooth:'unknown',
  wakeLock:null,
  online:navigator.onLine,
};

// Battery
async function initBattery(){
  if(navigator.getBattery){
    try{
      var b=await navigator.getBattery();
      sensorState.battery=b;
      var update=()=>{logEvent('battery_update',{level:Math.round(b.level*100),charging:b.charging});renderSensorHub();if(b.level<0.15&&!b.charging)logEvent('battery_low_warning',{level:Math.round(b.level*100)});updateBatteryReminder(b.level,b.charging);renderHeaderBattery(b.level,b.charging);};
      b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update);
      update();
    }catch(e){}
  }
}
// Escalating battery reminders — the 911 Find-Me Beacon (flashing lights + siren) drains the
// battery fast, so low charge directly means less time it could run if it's ever actually needed.
var BATTERY_TIER_KEY='totavivo_battery_tier_warned';
function updateBatteryReminder(level,charging){
  var card=document.getElementById('battery-reminder-card');
  if(!card)return;
  var pct=Math.round(level*100);
  if(charging||pct>50){
    card.style.display='none';
    try{TotaSession.removeItem(BATTERY_TIER_KEY);}catch(e){}
    return;
  }
  var tier=pct<=5?5:pct<=15?15:pct<=25?25:50;
  var title=document.getElementById('battery-reminder-title');
  var text=document.getElementById('battery-reminder-text');
  var copy={
    50:{t:'🔋 Battery at 50%',m:"Might be a good time to plug in — TotaVivo's safety features work best with a charged phone.",bg:'rgba(74,144,226,.06)',bd:'rgba(74,144,226,.25)'},
    25:{t:'🔋 Battery at 25%',m:'Please charge your phone soon.',bg:'rgba(255,209,102,.07)',bd:'rgba(255,209,102,.3)'},
    15:{t:'⚠️ Battery at 15%',m:'This is getting low. If you ever need the 911 Find-Me Beacon (flashing lights + siren), it may not be able to run for very long at this charge. Please plug in now.',bg:'rgba(255,160,50,.08)',bd:'rgba(255,160,50,.35)'},
    5:{t:'🚨 Battery at 5%',m:'You need to charge your phone right now — at this level, safety features like the Find-Me Beacon may not work when you need them most.',bg:'rgba(255,92,122,.1)',bd:'rgba(255,92,122,.4)'},
  }[tier];
  title.textContent=copy.t;text.textContent=copy.m;
  card.style.background=copy.bg;card.style.borderColor=copy.bd;
  card.style.display='block';
  var lastWarned=0;
  try{lastWarned=parseInt(TotaSession.getItem(BATTERY_TIER_KEY)||'0');}catch(e){}
  if(tier!==lastWarned){
    try{TotaSession.setItem(BATTERY_TIER_KEY,String(tier));}catch(e){}
    if(tier===50)showToast('🔋 Battery at 50% — consider charging soon');
    else if(tier===25)showToast('🔋 Battery at 25% — please charge soon');
    else if(tier===15){speak('Your battery is at 15 percent. If you ever need the emergency beacon, it may not run for long at this charge. Please charge your phone soon.');showToast('⚠️ Battery low — the Find-Me Beacon needs charge to work fully');}
    else if(tier===5){speak('Your battery is at 5 percent. Please charge your phone right now.');showToast('🚨 Battery critically low — charge now');}
  }
}
// Small live battery indicator in the header — real charge level, updates as the device's own
// battery reading changes. Android Chrome only; navigator.getBattery doesn't exist on iOS Safari.
function renderHeaderBattery(level,charging){
  var el=document.getElementById('hdr-battery');
  if(!el)return;
  var pct=Math.round(level*100);
  el.style.display='inline-flex';
  el.classList.toggle('charging',!!charging);
  el.classList.toggle('low',pct<=25&&!charging);
  el.classList.toggle('critical',pct<=15&&!charging);
  document.getElementById('hdr-battery-fill').style.width=Math.max(pct,4)+'%';
  document.getElementById('hdr-battery-pct').textContent=pct+'%';
  el.title='Battery '+pct+'%'+(charging?' (charging)':'');
}
// Network
function initNetwork(){
  var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(c){sensorState.network=c;c.addEventListener('change',()=>{logEvent('network_changed',{type:c.effectiveType,downlink:c.downlink});renderSensorHub();});}
  window.addEventListener('online',()=>{sensorState.online=true;logEvent('online_detected');renderSensorHub();});
  window.addEventListener('offline',()=>{sensorState.online=false;logEvent('offline_detected');renderSensorHub();});
}
// Location
function requestLocation(){
  if(!navigator.geolocation){showToast('Geolocation not supported');return;}
  logEvent('permission_requested',{sensor:'location'});
  navigator.geolocation.getCurrentPosition(
    pos=>{sensorState.location={lat:pos.coords.latitude.toFixed(4),lng:pos.coords.longitude.toFixed(4),acc:Math.round(pos.coords.accuracy)};logEvent('permission_granted',{sensor:'location'});showToast('📍 Location granted');renderSensorHub();
      // Continuous watch for family location sharing
      navigator.geolocation.watchPosition(p=>{sensorState.location={lat:p.coords.latitude.toFixed(4),lng:p.coords.longitude.toFixed(4),acc:Math.round(p.coords.accuracy)};renderSensorHub();},()=>{},{enableHighAccuracy:false,timeout:30000,maximumAge:60000});
    },
    err=>{logEvent('permission_denied',{sensor:'location',code:err.code});showToast('Location denied');renderSensorHub();},
    {enableHighAccuracy:true,timeout:10000,maximumAge:5000}
  );
}
// Motion / Fall detection via DeviceMotion
var motionHandler=null;
var MOTION_GRANTED_KEY='totavivo_motion_granted';
// Re-attach motion tracking automatically on every app open if it was ever granted before.
// Without this, closing/reopening the PWA (which happens constantly through a normal day)
// silently drops step counting and fall detection back to Off, with nothing telling the user —
// that's what "steps don't work" turns out to actually be.
function autoResumeMotion(){
  try{if(TotaStorage.getItem(MOTION_GRANTED_KEY)==='1')requestMotion();}catch(e){}
}
// ── Fall detection tuning ──
// Sensitivity sets how hard an impact (in g) must be before the fall check even starts.
// The old fixed 2.5g fired from just setting the phone down on a hard surface (or a book),
// so the default is now Medium. Steps counting is unaffected by any of this.
// NOTE: fall detection is only as good as the phone's own sensors — TotaVivo cannot
// upgrade a device's hardware, and older/sensor-poor devices may not detect falls at all.
// Sensitivity is a 1-6 level now (the old 3-button Low/Medium/High wasn't fine enough — the
// middle step could sit right where a real dropped-phone impact fell between "too sensitive"
// and "not sensitive enough"). Level 1 = least sensitive (needs the hardest impact), 6 = most.
// The g-force threshold interpolates linearly: L1=5.0g down to L6=2.0g.
var FALL_SENS_KEY='totavivo_fall_sens_v2'; // v2 = numeric 1-6; migrated from v1's low/medium/high
var FALL_PAUSE_KEY='totavivo_fall_pause_v1';
var FALL_SENS_LABELS={1:'Least — only hard falls',2:'Low',3:'Medium-low',4:'Medium (recommended)',5:'High',6:'Most — light bumps too'};
var fallSensLevel=4;
(function(){
  try{
    var v2=TotaStorage.getItem(FALL_SENS_KEY);
    if(v2!==null){fallSensLevel=Math.min(6,Math.max(1,parseInt(v2,10)||4));}
    else{
      var v1=TotaStorage.getItem('totavivo_fall_sens_v1');
      if(v1==='low')fallSensLevel=2;else if(v1==='high')fallSensLevel=5;else fallSensLevel=4;
      if(v1)try{TotaStorage.setItem(FALL_SENS_KEY,String(fallSensLevel));}catch(e){}
    }
  }catch(e){}
})();
function fallSpikeG(){return 5.0-(fallSensLevel-1)*0.6;} // L1 -> 5.0g ... L6 -> 2.0g
function fallPausedToday(){try{return TotaStorage.getItem(FALL_PAUSE_KEY)===todayKey();}catch(e){return false;}}
function applyFallSensUI(){
  var s=document.getElementById('fall-sens-slider');if(s)s.value=fallSensLevel;
  var lbl=document.getElementById('fall-sens-label');if(lbl)lbl.textContent='Level '+fallSensLevel+' · triggers at '+fallSpikeG().toFixed(1)+'g';
  var desc=document.getElementById('fall-sens-desc');if(desc)desc.textContent=FALL_SENS_LABELS[fallSensLevel];
}
function setFallSensitivity(level){
  fallSensLevel=Math.min(6,Math.max(1,parseInt(level,10)||4));
  try{TotaStorage.setItem(FALL_SENS_KEY,String(fallSensLevel));}catch(e){}
  applyFallSensUI();
  showToast('🎚️ Fall sensitivity: level '+fallSensLevel+' of 6 — '+FALL_SENS_LABELS[fallSensLevel]);
  if(typeof logEvent==='function')logEvent('fall_sensitivity_changed',{level:fallSensLevel,threshold_g:fallSpikeG().toFixed(1)});
}
function pauseFallUntilTomorrow(){
  try{TotaStorage.setItem(FALL_PAUSE_KEY,todayKey());}catch(e){}
  renderFallPauseState();
  showToast('😴 Fall alerts paused until tomorrow');
  speak('Okay, '+seniorName+'. Fall alerts are paused until tomorrow morning. Everything else keeps working, and they turn back on by themselves.');
  if(typeof logEvent==='function')logEvent('fall_paused_until_tomorrow',{});
}
function resumeFallAlerts(){
  try{TotaStorage.removeItem(FALL_PAUSE_KEY);}catch(e){}
  renderFallPauseState();
  showToast('🆘 Fall alerts are back ON');
  if(typeof logEvent==='function')logEvent('fall_pause_cleared',{});
}
function renderFallPauseState(){
  var btn=document.getElementById('fall-pause-btn');var lbl=document.getElementById('fall-pause-lbl');
  var paused=fallPausedToday();
  if(lbl)lbl.textContent=paused?'😴 Paused until tomorrow — tap to turn back on now':'😴 Pause Fall Alerts Until Tomorrow';
  if(btn)btn.onclick=paused?resumeFallAlerts:pauseFallUntilTomorrow;
}
async function requestMotion(){
  logEvent('permission_requested',{sensor:'motion'});
  try{
    // iOS 13+ requires explicit permission
    if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){
      var p=await DeviceMotionEvent.requestPermission();
      if(p!=='granted'){logEvent('permission_denied',{sensor:'motion'});try{TotaStorage.removeItem(MOTION_GRANTED_KEY);}catch(e){}showToast('Motion permission denied');return;}
    }
    if(!window.DeviceMotionEvent){showToast('Motion sensors not supported');return;}
    sensorState.motion.enabled=true;
    try{TotaStorage.setItem(MOTION_GRANTED_KEY,'1');}catch(e){}
    logEvent('permission_granted',{sensor:'motion'});
    showToast('🤸 Motion sensors active');
    motionHandler=function(e){
      var a=e.accelerationIncludingGravity||e.acceleration;
      if(!a)return;
      var now=new Date().getTime();
      var ax=a.x||0, ay=a.y||0, az=a.z||0;
      sensorState.motion.lastValues={ax:ax.toFixed(2),ay:ay.toFixed(2),az:az.toFixed(2)};
      var mag=Math.sqrt(ax*ax+ay*ay+az*az);
      var g=mag/9.81;
      if(g>sensorState.motion.maxG)sensorState.motion.maxG=g;
      // ── Step detection: high-pass the magnitude, count bounces (peaks) with debounce ──
      var sm=sensorState.motion;
      sm._avg = (sm._avg==null)?mag:(sm._avg*0.9+mag*0.1);
      var dyn = mag - sm._avg;            // remove gravity baseline
      if(dyn>1.1 && !sm._stepArmed && now-(sm._lastStep||0)>280){
        sm._stepArmed=true; sm._lastStep=now;
        if(typeof addStep==='function')addStep();
      } else if(dyn<0.3){ sm._stepArmed=false; }
      // Fall heuristic: impact spike over the sensitivity threshold → wait for stillness → trigger fall.
      // Skipped entirely while paused-until-tomorrow (steps above still count normally).
      if(g>fallSpikeG()&&!fallPausedToday()){
        if(now-sensorState.motion.lastSpike>3000){
          sensorState.motion.lastSpike=now;
          logEvent('motion_spike_detected',{g:g.toFixed(2)});
          // Confirm stillness in next 1.5s
          var stillCheck=setTimeout(()=>{
            var lv=sensorState.motion.lastValues;
            var stillG=Math.sqrt(lv.ax*lv.ax+lv.ay*lv.ay+lv.az*lv.az)/9.81;
            if(Math.abs(stillG-1)<0.3){
              logEvent('fall_auto_detected',{spike_g:g.toFixed(2)});
              if(typeof triggerFall==='function'&&!document.getElementById('fall-ov').classList.contains('show'))triggerFall();
            }
          },1500);
        }
      }
      // Throttle UI updates
      if(!sensorState.motion._lastRender||now-sensorState.motion._lastRender>250){sensorState.motion._lastRender=now;renderSensorMotion();}
    };
    window.addEventListener('devicemotion',motionHandler);
    fallActive=true;
    var tog=document.getElementById('tog-fall');if(tog)tog.classList.add('on');
  }catch(e){logEvent('permission_error',{sensor:'motion',err:String(e)});showToast('Motion error');}
}
function stopMotion(){if(motionHandler){window.removeEventListener('devicemotion',motionHandler);motionHandler=null;}sensorState.motion.enabled=false;logEvent('motion_stopped');renderSensorHub();}
// Notifications
async function requestNotifPerm(){
  if(!('Notification' in window)){showToast('Notifications not supported');return;}
  logEvent('permission_requested',{sensor:'notifications'});
  var p=await Notification.requestPermission();
  sensorState.notifications=p;
  logEvent('permission_'+(p==='granted'?'granted':'denied'),{sensor:'notifications'});
  showToast('🔔 Notifications: '+p);
  if(p==='granted')try{new Notification('TotaVivo',{body:'Notifications are on. Vivo can remind you anytime.',icon:'logo.svg'});}catch(e){}
  renderSensorHub();
}
// Storage
async function initStorage(){
  if(navigator.storage&&navigator.storage.estimate){
    try{var est=await navigator.storage.estimate();sensorState.storage={used:Math.round(est.usage/1024),quota:Math.round(est.quota/1024/1024)};renderSensorHub();}catch(e){}
  }
}
// Camera / Mic permissions
async function checkMediaPerms(){
  if(navigator.permissions&&navigator.permissions.query){
    try{var cam=await navigator.permissions.query({name:'camera'});sensorState.camera=cam.state;cam.onchange=()=>{sensorState.camera=cam.state;renderSensorHub();};}catch(e){}
    try{var mic=await navigator.permissions.query({name:'microphone'});sensorState.microphone=mic.state;mic.onchange=()=>{sensorState.microphone=mic.state;renderSensorHub();};}catch(e){}
  }
}
async function requestCameraMic(){
  logEvent('permission_requested',{sensor:'camera_mic'});
  try{
    var s=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    s.getTracks().forEach(t=>t.stop());
    sensorState.camera='granted';sensorState.microphone='granted';
    logEvent('permission_granted',{sensor:'camera_mic'});
    showToast('📷🎙 Camera & microphone granted');renderSensorHub();
  }catch(e){logEvent('permission_denied',{sensor:'camera_mic'});showToast('Camera/mic denied');renderSensorHub();}
}
// Vibration
function testVibration(){if(navigator.vibrate){navigator.vibrate([200,100,200,100,200]);showToast('📳 Vibrating');logEvent('vibration_test');}else showToast('Vibration not supported');}
// Wake Lock
async function toggleWakeLock(){
  if(!('wakeLock' in navigator)){showToast('Wake Lock not supported');return;}
  if(sensorState.wakeLock){await sensorState.wakeLock.release();sensorState.wakeLock=null;showToast('💤 Wake lock released');logEvent('wake_lock_released');}
  else{try{sensorState.wakeLock=await navigator.wakeLock.request('screen');showToast('☀️ Screen will stay on');logEvent('wake_lock_acquired');sensorState.wakeLock.addEventListener('release',()=>{sensorState.wakeLock=null;renderSensorHub();});}catch(e){showToast('Wake lock failed');}}
  renderSensorHub();
}

// ════════════════════════════════════════════════════════════════
// ═══ STYLE LAB — colors, background, shape, save/revert ═══
// ════════════════════════════════════════════════════════════════
var STYLE_KEY='totavivo_style_v2';
var styleDefaults={
  '--phone-idle-color':'#5bb8ff',
  '--phone-active-color':'#00e676',
  '--phone-end-color':'#ff3b3b',
  '--a2':'#00c2ff',
  '--green':'#00e096',
  '--red':'#ff5c7a',
  '--text':'#cce4ff',
  '--sub':'#7aa8d8',
  '--card':'rgba(25,10,65,.97)',
};
var pickerMap={'--phone-idle-color':'sl-phone-idle','--phone-active-color':'sl-phone-active','--phone-end-color':'sl-phone-end','--a2':'sl-accent','--green':'sl-success','--red':'sl-danger','--text':'sl-text','--sub':'sl-sub'};
var currentStyle={};    // unsaved (preview) state
var savedStyle={};      // last saved snapshot
var currentShape='rounded',currentBW='normal',currentBgDir='radial';
var currentBg1='#1a0035',currentBg2='#04001a';
var savedSnapshot={};

function setStyleVar(name,value){currentStyle[name]=value;document.documentElement.style.setProperty(name,value);updatePreview();markUnsaved();}
function updateCardColor(hex){
  // Convert hex to rgba so existing card transparency-style still feels right
  var rgba=hexToRgba(hex,.97);
  currentStyle['--card']=rgba;
  document.documentElement.style.setProperty('--card',rgba);
  updatePreview();markUnsaved();
}
function hexToRgba(hex,a){var h=hex.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');var n=parseInt(h,16);return'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
function updateBackground(){
  currentBg1=document.getElementById('sl-bg1').value;
  currentBg2=document.getElementById('sl-bg2').value;
  applyBackground();markUnsaved();
}
function setBgDir(dir){
  currentBgDir=dir;
  document.querySelectorAll('#sl-bgdir-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bgdir===dir));
  applyBackground();markUnsaved();
}
function applyBackground(){
  var bg=currentBg1;
  if(currentBgDir==='radial')bg='radial-gradient(ellipse at top,'+currentBg1+','+currentBg2+')';
  else if(currentBgDir==='ttb')bg='linear-gradient(180deg,'+currentBg1+','+currentBg2+')';
  else if(currentBgDir==='ltr')bg='linear-gradient(90deg,'+currentBg1+','+currentBg2+')';
  else if(currentBgDir==='diag')bg='linear-gradient(135deg,'+currentBg1+','+currentBg2+')';
  document.body.style.setProperty('--page-bg',bg);
  // Also update inner phone-shell --bg for visual cohesion
  document.documentElement.style.setProperty('--bg',currentBg1);
  currentStyle.__pageBg=bg;
  currentStyle.__bg1=currentBg1;
  currentStyle.__bg2=currentBg2;
  currentStyle.__bgDir=currentBgDir;
}
function setBtnShape(shape){currentShape=shape;document.body.classList.remove('shape-square','shape-rounded','shape-pill');if(shape!=='rounded')document.body.classList.add('shape-'+shape);document.querySelectorAll('#sl-shape-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.shape===shape));markUnsaved();}
function setBorderWeight(bw){currentBW=bw;document.body.classList.remove('bw-thin','bw-thick');if(bw!=='normal')document.body.classList.add('bw-'+bw);document.querySelectorAll('#sl-bw-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bw===bw));markUnsaved();}

function updatePreview(){var tile=document.getElementById('sl-pv-tile');if(tile&&!tile.querySelector('svg'))tile.innerHTML=SVG_PHONE_CALL_IN;}
function markUnsaved(){var btn=document.getElementById('sl-save-btn');var lbl=document.getElementById('sl-save-lbl');if(btn){btn.classList.add('gor');btn.classList.remove('gf');}if(lbl)lbl.textContent='💾 Save My Styles *';}
function markSaved(){var btn=document.getElementById('sl-save-btn');var lbl=document.getElementById('sl-save-lbl');if(btn){btn.classList.remove('gor');btn.classList.add('gf');}if(lbl)lbl.textContent='💾 Saved ✓';setTimeout(()=>{if(lbl&&lbl.textContent==='💾 Saved ✓')lbl.textContent='💾 Save My Styles';},2000);}

function snapshot(){return{vars:JSON.parse(JSON.stringify(currentStyle)),shape:currentShape,bw:currentBW,bg1:currentBg1,bg2:currentBg2,bgDir:currentBgDir};}
function saveStyleExplicit(){
  savedSnapshot=snapshot();
  try{TotaStorage.setItem(STYLE_KEY,JSON.stringify(savedSnapshot));}catch(e){}
  showToast('✅ Styles saved — will load next time too');
  speak('Your styles have been saved.');
  markSaved();
}
function revertStyle(){
  if(!savedSnapshot||!savedSnapshot.vars){showToast('No saved style to revert to');return;}
  applySnapshot(savedSnapshot);
  showToast('↩ Reverted to last saved styles');
  markSaved();
}
function applySnapshot(snap){
  // Reset everything first
  Object.keys(styleDefaults).forEach(k=>document.documentElement.style.removeProperty(k));
  document.body.classList.remove('shape-square','shape-rounded','shape-pill','bw-thin','bw-thick');
  document.body.style.removeProperty('--page-bg');
  currentStyle={};
  // Apply snapshot
  if(snap.vars){
    Object.keys(snap.vars).forEach(k=>{
      if(k.startsWith('--')){document.documentElement.style.setProperty(k,snap.vars[k]);currentStyle[k]=snap.vars[k];}
    });
    Object.keys(pickerMap).forEach(k=>{
      var el=document.getElementById(pickerMap[k]);
      if(el&&snap.vars[k]&&/^#[0-9a-f]+$/i.test(snap.vars[k]))el.value=snap.vars[k];
    });
  }
  currentShape=snap.shape||'rounded';
  if(currentShape!=='rounded')document.body.classList.add('shape-'+currentShape);
  document.querySelectorAll('#sl-shape-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.shape===currentShape));
  currentBW=snap.bw||'normal';
  if(currentBW!=='normal')document.body.classList.add('bw-'+currentBW);
  document.querySelectorAll('#sl-bw-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bw===currentBW));
  currentBg1=snap.bg1||'#1a0035';currentBg2=snap.bg2||'#04001a';currentBgDir=snap.bgDir||'radial';
  var b1=document.getElementById('sl-bg1');if(b1)b1.value=currentBg1;
  var b2=document.getElementById('sl-bg2');if(b2)b2.value=currentBg2;
  document.querySelectorAll('#sl-bgdir-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bgdir===currentBgDir));
  applyBackground();
  updatePreview();
}
function loadStyle(){
  try{var s=TotaStorage.getItem(STYLE_KEY);if(!s){updatePreview();return;}
    savedSnapshot=JSON.parse(s);
    applySnapshot(savedSnapshot);
    markSaved();
  }catch(e){console.warn('Style load failed',e);}
  // Sync video provider picker
  var vp=document.getElementById('sl-video-provider');if(vp&&typeof videoProvider!=='undefined')vp.value=videoProvider;
}
function resetStyle(){
  Object.keys(styleDefaults).forEach(k=>{document.documentElement.style.removeProperty(k);var pid=pickerMap[k];if(pid){var el=document.getElementById(pid);if(el)el.value=styleDefaults[k];}});
  currentStyle={};currentShape='rounded';currentBW='normal';currentBg1='#1a0035';currentBg2='#04001a';currentBgDir='radial';
  document.body.classList.remove('shape-square','shape-rounded','shape-pill','bw-thin','bw-thick');
  document.body.style.removeProperty('--page-bg');
  var b1=document.getElementById('sl-bg1');if(b1)b1.value='#1a0035';
  var b2=document.getElementById('sl-bg2');if(b2)b2.value='#04001a';
  document.querySelectorAll('#sl-shape-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.shape==='rounded'));
  document.querySelectorAll('#sl-bw-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bw==='normal'));
  document.querySelectorAll('#sl-bgdir-grp .sl-shape-btn').forEach(b=>b.classList.toggle('active',b.dataset.bgdir==='radial'));
  savedSnapshot={};
  try{TotaStorage.removeItem(STYLE_KEY);}catch(e){}
  showToast('↻ Styles reset to defaults');
  speak('Your styles have been reset.');
  markSaved();
}

// ════════════════════════════════════════════════════════════════
// ═══ SMART HOME ═══
// ════════════════════════════════════════════════════════════════
var shCurrentRoom='living';
var shRooms={
  living:{label:'Living Room',icon:'🛋️',devices:[
    {id:'lr-ceil',name:'Ceiling Light',type:'dimmer',icon:'💡',on:true,level:80},
    {id:'lr-lamp',name:'Floor Lamp',type:'dimmer',icon:'🪔',on:false,level:50},
    {id:'lr-tv',name:'TV',type:'switch',icon:'📺',on:false},
    {id:'lr-fan',name:'Ceiling Fan',type:'switch',icon:'🪭',on:false},
    {id:'lr-blinds',name:'Window Blinds',type:'dimmer',icon:'🪟',on:true,level:60},
  ]},
  kitchen:{label:'Kitchen',icon:'🍳',devices:[
    {id:'kt-light',name:'Overhead Light',type:'dimmer',icon:'💡',on:true,level:100},
    {id:'kt-coffee',name:'Coffee Maker',type:'switch',icon:'☕',on:false},
    {id:'kt-fridge',name:'Smart Fridge',type:'info',icon:'🧊',state:'Closed · 38°'},
  ]},
  bedroom:{label:'Bedroom',icon:'🛏️',devices:[
    {id:'br-light',name:'Bedside Lamp',type:'dimmer',icon:'🛏️',on:false,level:30},
    {id:'br-fan',name:'Ceiling Fan',type:'switch',icon:'🪭',on:true},
    {id:'br-blinds',name:'Blackout Blinds',type:'dimmer',icon:'🪟',on:false,level:0},
  ]},
  bathroom:{label:'Bathroom',icon:'🛁',devices:[
    {id:'ba-light',name:'Vanity Light',type:'switch',icon:'💡',on:false},
    {id:'ba-night',name:'Night Light',type:'switch',icon:'🌙',on:true},
  ]},
  outside:{label:'Outside',icon:'🌳',devices:[
    {id:'out-porch',name:'Porch Light',type:'switch',icon:'🏠',on:true},
    {id:'out-cam',name:'Doorbell Camera',type:'info',icon:'📹',state:'Recording · No motion'},
    {id:'out-garage',name:'Garage Light',type:'switch',icon:'🚗',on:false},
  ]},
};

// ═══ CAMERAS — instant live-view tiles (Phase 0: auto-refreshing snapshots) ═══
var CAM_KEY='totavivo_cameras_v1';
var cameras=null;
var camTimer=null;
function loadCameras(){
  try{var s=TotaStorage.getItem(CAM_KEY);cameras=s?JSON.parse(s):null;}catch(e){cameras=null;}
  if(!Array.isArray(cameras)){cameras=[{id:'demo1',name:'Front Door (Demo)',url:''}];saveCameras();}
}
function saveCameras(){try{TotaStorage.setItem(CAM_KEY,JSON.stringify(cameras));}catch(e){}}
function renderCameras(){
  var g=document.getElementById('cam-grid');if(!g)return;
  if(!Array.isArray(cameras))loadCameras();
  if(!cameras.length){g.innerHTML='<div style="grid-column:1/-1;font-size:11px;color:var(--sub);font-style:italic;padding:8px 2px">No cameras yet — tap “➕ Add Camera” and paste a snapshot link.</div>';return;}
  g.innerHTML=cameras.map(function(c){
    var inner=c.url
      ? '<img class="cam-img" data-cam="'+escAttr(c.id)+'" alt="'+escAttr(c.name)+'">'
      : '<div class="cam-demo"><div class="cdi">📷</div><div class="cdc" id="camclock-'+escAttr(c.id)+'">--:--:--</div></div>';
    return '<div class="cam-tile">'
      +(c.url?'':'<span class="cam-badge">DEMO</span>')
      +'<button class="cam-rm" onclick="removeCamera(\''+escJs(c.id)+'\')" title="Remove camera">✕</button>'
      +inner
      +'<div class="cam-name"><span class="cam-live"></span>'+esc(c.name)+'</div>'
      +'</div>';
  }).join('');
  refreshCameras();
  startCamRefresh();
}
function refreshCameras(){
  if(!Array.isArray(cameras))return;
  var bust=Date.now();
  cameras.forEach(function(c){
    if(c.url){
      var sel='.cam-img[data-cam="'+((window.CSS&&CSS.escape)?CSS.escape(c.id):c.id)+'"]';
      var img=document.querySelector(sel);
      if(img)img.src=c.url+(c.url.indexOf('?')>=0?'&':'?')+'_t='+bust;
    }else{
      var clk=document.getElementById('camclock-'+c.id);
      if(clk)clk.textContent=new Date().toLocaleTimeString();
    }
  });
}
function startCamRefresh(){
  if(camTimer)return;
  camTimer=setInterval(function(){
    var sm=document.getElementById('s-smarthome');
    if(!sm||!sm.classList.contains('active')){clearInterval(camTimer);camTimer=null;return;}
    refreshCameras();
  },2500);
}
function addCamera(){
  var name=prompt('Camera name (for example: Front Door):');
  if(!name||!name.trim())return;
  var url=prompt('Paste the camera\'s SNAPSHOT image link.\nLeave blank to add a demo tile.','');
  if(url){url=url.trim();if(url&&!/^https?:\/\//i.test(url)){alert('Please paste a full http(s) link to the snapshot image, or leave it blank for a demo tile.');return;}}
  cameras.push({id:'cam'+Date.now().toString(36),name:name.trim(),url:url||''});
  saveCameras();renderCameras();
  showToast('📷 Camera added'+(url?'':' (demo tile)'));
  if(typeof logEvent==='function')logEvent('camera_added',{live:!!url});
}
function removeCamera(id){
  if(!Array.isArray(cameras))return;
  cameras=cameras.filter(function(c){return c.id!==id;});
  saveCameras();renderCameras();
}

function renderSmartHome(){
  renderCameras();
  var tabs=document.getElementById('sh-room-tabs');
  tabs.innerHTML=Object.keys(shRooms).map(k=>`<button class="sh-rtab${k===shCurrentRoom?' active':''}" onclick="selectShRoom('${k}')">${shRooms[k].icon} ${shRooms[k].label}</button>`).join('');
  renderShDevices();
  renderHubs();
}

// ─── Connected Hubs (Google Home, Alexa, HomeKit, SmartThings) ───
var HUB_KEY='totavivo_hubs_v1';
var hubs=[
  {id:'google',  name:'Google Home',   icon:'🏡', tint:'rgba(0,153,255,.15)',   connected:true,  devices:12},
  {id:'alexa',   name:'Amazon Alexa',  icon:'🟦', tint:'rgba(74,144,226,.15)',  connected:true,  devices:8},
  {id:'homekit', name:'Apple HomeKit', icon:'🍎', tint:'rgba(180,100,255,.15)', connected:false, devices:0},
  {id:'smartthings', name:'SmartThings', icon:'🌐', tint:'rgba(0,224,150,.15)', connected:false, devices:0},
];
function loadHubs(){try{var s=TotaStorage.getItem(HUB_KEY);if(s){var saved=JSON.parse(s);hubs.forEach(h=>{var st=saved.find(x=>x.id===h.id);if(st){h.connected=st.connected;h.devices=st.devices;}});}}catch(e){}}
function saveHubs(){try{TotaStorage.setItem(HUB_KEY,JSON.stringify(hubs.map(h=>({id:h.id,connected:h.connected,devices:h.devices}))));}catch(e){}}
function renderHubs(){
  var list=document.getElementById('hub-list');if(!list)return;
  list.innerHTML=hubs.map(h=>{
    var status=h.connected?(h.devices+' devices · Synced just now'):'Not connected';
    var btn=h.connected?'<button class="sync-btn connected" onclick="toggleHub(\''+h.id+'\')">✓ Connected</button>':'<button class="sync-btn" onclick="toggleHub(\''+h.id+'\')">Connect</button>';
    return '<div class="sync-account-row"><div class="sync-icon" style="background:'+h.tint+'">'+h.icon+'</div><div class="sync-info"><div class="sn">'+h.name+'</div><div class="sd">'+status+'</div></div>'+btn+'</div>';
  }).join('');
}
function toggleHub(id){
  var h=hubs.find(x=>x.id===id);if(!h)return;
  if(h.connected){
    h.connected=false;h.devices=0;
    showToast('✕ '+h.name+' disconnected');speak(h.name+' disconnected.');
    if(typeof logEvent==='function')logEvent('hub_disconnected',{hub:h.id});
  }else{
    showToast('🔗 Linking '+h.name+'…');
    setTimeout(()=>{
      h.connected=true;
      h.devices=Math.floor(Math.random()*10)+5;  // mock device discovery
      saveHubs();renderHubs();
      showToast('✅ '+h.name+' connected · '+h.devices+' devices found');
      speak(h.name+' connected. Found '+h.devices+' devices.');
      if(typeof fireIft==='function')fireIft('hub_connected',h.id,String(h.devices));
      if(typeof logEvent==='function')logEvent('hub_connected',{hub:h.id,devices:h.devices});
    },1400);
    return;
  }
  saveHubs();renderHubs();
  if(typeof fireIft==='function')fireIft('hub_'+(h.connected?'connected':'disconnected'),h.id);
}
function selectShRoom(k){shCurrentRoom=k;renderSmartHome();}
function renderShDevices(){
  var list=document.getElementById('sh-device-list');
  var room=shRooms[shCurrentRoom];
  list.innerHTML=room.devices.map(d=>{
    if(d.type==='info'){
      return `<div class="sh-device"><div class="sh-dicon">${d.icon}</div><div class="sh-dinfo"><div class="sh-dname">${d.name}</div><div class="sh-dstate">${d.state}</div></div></div>`;
    }
    var stateLabel=d.on?(d.type==='dimmer'?d.level+'% on':'On'):'Off';
    var ctrl=d.type==='dimmer'?`<input type="range" class="sh-dimmer" min="0" max="100" value="${d.level}" oninput="setShLevel('${d.id}',this.value)">`:'';
    return `<div class="sh-device${d.on?' on':''}" id="shd-${d.id}">
      <div class="sh-dicon">${d.icon}</div>
      <div class="sh-dinfo"><div class="sh-dname">${d.name}</div><div class="sh-dstate">${stateLabel}</div></div>
      <div class="sh-dctrl">${ctrl}<div class="tog${d.on?' on':''}" onclick="toggleShDevice('${d.id}')"></div></div>
    </div>`;
  }).join('');
}
function findShDevice(id){for(var k in shRooms){var d=shRooms[k].devices.find(x=>x.id===id);if(d)return d;}return null;}
function toggleShDevice(id){var d=findShDevice(id);if(!d)return;d.on=!d.on;renderShDevices();showToast(d.icon+' '+d.name+': '+(d.on?'ON':'OFF'));fireIft('device_toggled',d.name,d.on?'on':'off');if(typeof logEvent==='function')logEvent('smart_device_toggled',{device:d.name,room:shCurrentRoom,state:d.on?'on':'off'});}
function setShLevel(id,v){var d=findShDevice(id);if(!d)return;d.level=parseInt(v);d.on=d.level>0;renderShDevices();}
function runScene(name){
  var scenes={
    morning:{msg:'Good morning, '+seniorName+'! Lights on, coffee starting, blinds open.',apply:()=>{shRooms.living.devices.forEach(d=>{if(d.type==='dimmer'){d.on=true;d.level=80;}});shRooms.kitchen.devices.forEach(d=>{if(d.id==='kt-coffee'||d.id==='kt-light')d.on=true;});}},
    bedtime:{msg:'Bedtime scene. All lights off, doors locked, heat to 68 degrees.',apply:()=>{for(var k in shRooms)shRooms[k].devices.forEach(d=>{if(d.type==='dimmer'||d.type==='switch')d.on=false;});document.getElementById('thermo-temp').textContent='68°';lockAll();}},
    movie:{msg:'Movie night. Lights dimmed, TV on, blinds down.',apply:()=>{shRooms.living.devices.forEach(d=>{if(d.id==='lr-ceil'){d.on=true;d.level=20;}if(d.id==='lr-lamp'){d.on=true;d.level=15;}if(d.id==='lr-tv')d.on=true;if(d.id==='lr-blinds'){d.on=false;d.level=0;}});}},
    away:{msg:'Away mode. Everything off, all doors locked, security armed.',apply:()=>{for(var k in shRooms)shRooms[k].devices.forEach(d=>{if(d.type==='dimmer'||d.type==='switch')d.on=false;});lockAll();}},
  };
  var s=scenes[name];if(!s)return;
  s.apply();
  if(shCurrentRoom)renderShDevices();
  speak(s.msg);
  showToast('🎬 '+name.charAt(0).toUpperCase()+name.slice(1)+' scene activated');
  fireIft('scene_activated',name);
  if(typeof logEvent==='function')logEvent('scene_activated',{scene:name});
}
function adjustTemp(d){var el=document.getElementById('thermo-temp');var v=parseInt(el.textContent)+d;el.textContent=v+'°';showToast('🌡️ Thermostat set to '+v+'°');fireIft('thermostat_changed',String(v));}
function toggleLock(which){
  var el=document.getElementById('lock-'+which);
  var isUnlocked=el.classList.contains('unlocked');
  if(isUnlocked){
    el.classList.remove('unlocked');
    el.querySelector('.sh-lock-icon').textContent='🔒';
    el.querySelector('.ls').textContent='Locked · just now';
    el.querySelector('.sh-lock-btn').textContent='Unlock';
    showToast('🔒 '+which.charAt(0).toUpperCase()+which.slice(1)+' locked');
    fireIft('door_locked',which);
  }else{
    el.classList.add('unlocked');
    el.querySelector('.sh-lock-icon').textContent='🔓';
    el.querySelector('.ls').textContent='Unlocked';
    el.querySelector('.sh-lock-btn').textContent='Lock';
    showToast('🔓 '+which.charAt(0).toUpperCase()+which.slice(1)+' unlocked');
    fireIft('door_unlocked',which);
  }
}
function lockAll(){['front','back','garage'].forEach(w=>{var el=document.getElementById('lock-'+w);if(el&&el.classList.contains('unlocked')){el.classList.remove('unlocked');el.querySelector('.sh-lock-icon').textContent='🔒';el.querySelector('.ls').textContent='Locked · just now';el.querySelector('.sh-lock-btn').textContent='Unlock';}});}

// ════════════════════════════════════════════════════════════════
// ═══ IFTTT ═══
// ════════════════════════════════════════════════════════════════
var IFT_KEY_STORAGE='totavivo_ifttt_key';
var iftKey='';
var iftLog=[];
var iftApplets=[
  {id:'fall',event:'fall_detected',name:'🆘 Fall → Text family + flash lights',desc:'fall_detected'},
  {id:'med',event:'med_taken',name:'💊 Med taken → Log to Google Sheet',desc:'med_taken'},
  {id:'bill',event:'bill_paid',name:'💳 Bill paid → Email receipt to Susan',desc:'bill_paid'},
  {id:'bed',event:'bedtime_scene',name:'🌙 Bedtime → Lock doors + set thermostat',desc:'bedtime_scene'},
  {id:'away',event:'away_mode',name:'🚪 Away → Arm security camera',desc:'away_mode'},
  {id:'arr',event:'arrived_home',name:'🏠 Arrived home → Lights on + unlock',desc:'arrived_home'},
];

function loadIftKey(){try{iftKey=TotaStorage.getItem(IFT_KEY_STORAGE)||'';}catch(e){iftKey='';}}
function saveIftKey(v){iftKey=(v||'').trim();try{TotaStorage.setItem(IFT_KEY_STORAGE,iftKey);}catch(e){}refreshIftStatus();}
function refreshIftStatus(){var s=document.getElementById('ift-status');if(!s)return;if(iftKey){s.textContent='🟢 Key saved — events will POST to IFTTT';s.className='ift-status ok';}else{s.textContent='⚪ No key set — webhooks will be simulated';s.className='ift-status';}}

function renderIfttt(){
  loadIftKey();
  var input=document.getElementById('ift-key');if(input&&!input.value)input.value=iftKey;
  refreshIftStatus();
  var list=document.getElementById('ift-applet-list');
  list.innerHTML=iftApplets.map(a=>`<div class="ift-applet">
    <div class="ift-aicon">${a.name.split(' ')[0]}</div>
    <div class="ift-ainfo"><div class="ift-aname">${a.name.split(' ').slice(1).join(' ')}</div><div class="ift-atrig">trigger: ${a.event}</div></div>
    <button class="ift-arun" onclick="fireIft('${a.event}','manual_test','')">▶ Run</button>
  </div>`).join('');
  renderIftLog();
}
function renderIftLog(){
  var el=document.getElementById('ift-log');if(!el)return;
  if(!iftLog.length){el.innerHTML='<div style="font-style:italic">No events fired yet.</div>';return;}
  el.innerHTML=iftLog.slice(0,30).map(entry=>`<div>${entry.time} · <span style="color:var(--a2)">${entry.event}</span> · ${entry.status}</div>`).join('');
}
function fireIft(event,v1,v2,v3){
  var time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var entry={time,event,status:iftKey?'POST sent':'simulated'};
  iftLog.unshift(entry);renderIftLog();
  if(!iftKey)return;
  try{
    var url='https://maker.ifttt.com/trigger/'+encodeURIComponent(event)+'/with/key/'+encodeURIComponent(iftKey);
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value1:v1||'',value2:v2||'',value3:v3||''})})
      .then(r=>{entry.status=r.ok?'✅ '+r.status:'❌ '+r.status;renderIftLog();})
      .catch(e=>{entry.status='⚠️ network';renderIftLog();});
  }catch(e){entry.status='⚠️ error';renderIftLog();}
}
function fireCustomIft(){
  var ev=document.getElementById('ift-custom-event').value.trim();
  var v1=document.getElementById('ift-custom-v1').value.trim();
  if(!ev){showToast('Please enter an event name');return;}
  fireIft(ev,v1,'','');
  showToast('🚀 Event "'+ev+'" fired');
}

// ════════════════════════════════════════════════════════════════
// ═══ BLUETOOTH ═══
// ════════════════════════════════════════════════════════════════
var btPaired=[
  {id:'ha',name:'Phonak Hearing Aid R (Demo)',icon:'🦻',battery:78,signal:'Strong',connected:true,info:'Streaming Vivo voice'},
  {id:'bp',name:'Omron BP Monitor (Demo)',icon:'💉',battery:62,signal:'Good',connected:true,info:'Last reading 122/78'},
  {id:'pill',name:'Hero Smart Pillbox (Demo)',icon:'💊',battery:91,signal:'Good',connected:true,info:'Dispenses Mon–Sun'},
  {id:'pend',name:'Vivo Fall Pendant (Demo)',icon:'🆘',battery:88,signal:'Excellent',connected:true,info:'Worn since 7:14 AM'},
  {id:'scale',name:'Withings Body Scale (Demo)',icon:'⚖️',battery:54,signal:'Idle',connected:false,info:'Last weighed 3 days ago'},
];
var btNearby=[];
var btScanning=false;
var btScanTimer=null;

function renderBluetooth(){
  var p=document.getElementById('bt-paired-list');
  p.innerHTML=btPaired.map(d=>btDeviceHTML(d,true)).join('');
  var n=document.getElementById('bt-nearby-list');
  if(!btNearby.length&&!btScanning)n.innerHTML='<div class="bt-empty">Tap Scan to find nearby devices</div>';
  else if(btScanning&&!btNearby.length)n.innerHTML='<div class="bt-empty">🔍 Scanning…</div>';
  else n.innerHTML=btNearby.map(d=>btDeviceHTML(d,false)).join('');
  // Honest note about whether REAL scanning is possible on this device
  var note=document.getElementById('bt-support-note');
  if(note){
    note.innerHTML=navigator.bluetooth
      ? 'Put your hearing aid, BP monitor, pillbox, fall pendant, or scale into pairing mode, then tap <strong>Scan</strong> to find your real device.'
      : '⚠️ Your phone\'s browser (Safari on iPhone) can\'t scan for Bluetooth — Apple doesn\'t allow it. The devices shown here are <strong>demos</strong>. Real scanning works on Android Chrome, or in a future App Store version.';
  }
}
// ── WI-FI / CONNECTION STRENGTH ──
// The Network Information API (navigator.connection) reports the CURRENT connection's quality.
// There is no web API to list nearby Wi-Fi networks — that's native-only. iOS Safari doesn't
// implement navigator.connection at all, so on an iPhone we honestly show "online, no detail".
function connStrength(){
  var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(!c)return null;
  var et=c.effectiveType||'';
  var bars=et==='4g'?4:et==='3g'?3:et==='2g'?2:et==='slow-2g'?1:(c.downlink>=5?4:c.downlink>=2?3:c.downlink>0?2:1);
  return {effectiveType:et,downlink:c.downlink,rtt:c.rtt,bars:bars};
}
function checkWifiSignal(){
  var el=document.getElementById('wifi-info');if(!el)return;
  if(!navigator.onLine){el.innerHTML='<strong style="color:var(--red);font-size:15px">❌ Offline</strong><div style="font-size:10px;color:var(--sub)">No internet connection right now.</div>';speak('You are offline right now.');return;}
  var s=connStrength();
  if(!s){el.innerHTML='<strong style="color:var(--green);font-size:15px">✅ Connected</strong><div style="font-size:10px;color:var(--sub)">You\'re online. Your phone\'s browser doesn\'t report the exact signal strength (this is normal on iPhone).</div>';speak('You are connected to the internet.');return;}
  var bars='▮'.repeat(s.bars)+'▯'.repeat(4-s.bars);
  var quality=s.bars>=4?'Strong':s.bars===3?'Good':s.bars===2?'Weak':'Very weak';
  var col=s.bars>=3?'var(--green)':s.bars===2?'var(--yellow)':'var(--red)';
  el.innerHTML='<strong style="color:'+col+';font-size:16px;letter-spacing:2px">'+bars+'</strong> <strong style="color:'+col+'">'+quality+'</strong>'
    +'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+(s.effectiveType?s.effectiveType.toUpperCase()+' · ':'')+'about '+(s.downlink||'—')+' Mbps down · '+(s.rtt||'—')+' ms delay</div>';
  speak('Your connection is '+quality+'.');
  if(typeof logEvent==='function')logEvent('wifi_checked',{bars:s.bars,type:s.effectiveType});
}
function btDeviceHTML(d,paired){
  var battClass=d.battery<25?'low':'';
  return `<div class="bt-device${d.connected?' connected':''}">
    <div class="bt-dicon">${d.icon}</div>
    <div class="bt-dinfo">
      <div class="bt-dname">${d.name}</div>
      <div class="bt-dmeta">
        <span class="bt-batt ${battClass}">🔋 ${d.battery}%</span>
        <span class="bt-signal">📡 ${d.signal}</span>
        ${d.info?'<span>'+d.info+'</span>':''}
      </div>
    </div>
    <button class="bt-dbtn" onclick="${paired?'toggleBtConnect':'pairBt'}('${d.id}')">${d.connected?'Disconnect':(paired?'Connect':'Pair')}</button>
  </div>`;
}
function toggleBtConnect(id){var d=btPaired.find(x=>x.id===id);if(!d)return;d.connected=!d.connected;renderBluetooth();showToast(d.icon+' '+d.name+': '+(d.connected?'Connected':'Disconnected'));fireIft('bluetooth_'+(d.connected?'connected':'disconnected'),d.name);}
function pairBt(id){var d=btNearby.find(x=>x.id===id);if(!d)return;d.connected=true;btPaired.push(d);btNearby=btNearby.filter(x=>x.id!==id);renderBluetooth();showToast('✅ Paired '+d.name);speak(d.name+' has been paired.');fireIft('bluetooth_paired',d.name);}

async function startBtScan(){
  var btn=document.getElementById('bt-scan-btn');
  // Real Web Bluetooth — works on Android Chrome & desktop Chrome. Apple does NOT implement
  // it in iOS Safari at all, so on an iPhone navigator.bluetooth is undefined and we say so
  // honestly rather than pretending to scan.
  if(navigator.bluetooth){
    btn.classList.add('scanning');btn.textContent='🔍 Scanning…';btScanning=true;renderBluetooth();
    try{
      var d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:['battery_service']});
      var dev={id:'real-'+Date.now(),name:(d.name||'Unknown Device'),icon:guessBtIcon(d.name||''),battery:Math.floor(Math.random()*40)+60,signal:'Good',connected:false,info:'Real device — just found'};
      btNearby.unshift(dev);
      showToast('✅ Found '+dev.name);
    }catch(e){
      showToast('No device selected — put it in pairing mode and try again');
    }
    btScanning=false;btn.classList.remove('scanning');btn.textContent='🔍 Scan for Devices';renderBluetooth();
    return;
  }
  // No Web Bluetooth (iPhone Safari): be honest, then show the clearly-labeled demo set.
  showToast('⚠️ This phone can\'t scan Bluetooth in the browser — showing demo devices');
  speak('Your phone\'s browser cannot scan for Bluetooth here. Showing demonstration devices instead.');
  btn.classList.add('scanning');btn.textContent='🔍 Scanning…';btScanning=true;renderBluetooth();
  clearTimeout(btScanTimer);
  btScanTimer=setTimeout(()=>{
    btNearby=[
      {id:'mock-thermo',name:'Nest Thermostat (Demo)',icon:'🌡️',battery:84,signal:'Good',connected:false},
      {id:'mock-watch',name:'Apple Watch (Demo)',icon:'⌚',battery:72,signal:'Strong',connected:false},
      {id:'mock-glucose',name:'Dexcom G7 Sensor (Demo)',icon:'🩸',battery:96,signal:'Strong',connected:false,info:'Glucose: 112 mg/dL'},
    ];
    btScanning=false;
    btn.classList.remove('scanning');btn.textContent='🔍 Scan for Devices';
    renderBluetooth();
  },1500);
}
function stopBtScan(){clearTimeout(btScanTimer);btScanning=false;var btn=document.getElementById('bt-scan-btn');if(btn){btn.classList.remove('scanning');btn.textContent='🔍 Scan for Devices';}renderBluetooth();}
function guessBtIcon(name){var n=name.toLowerCase();if(n.includes('hearing'))return'🦻';if(n.includes('watch'))return'⌚';if(n.includes('scale'))return'⚖️';if(n.includes('blood')||n.includes('bp'))return'💉';if(n.includes('pill'))return'💊';if(n.includes('camera'))return'📷';if(n.includes('speaker'))return'🔊';if(n.includes('headphone'))return'🎧';return'📶';}

// ════════════════════════════════════════════════════════════════
// ═══ SENSOR HUB rendering ═══
// ════════════════════════════════════════════════════════════════
function renderSensorHub(){
  // Device info
  var dev=document.getElementById('device-info');
  if(dev){
    dev.innerHTML='<div><strong style="color:var(--text)">Platform:</strong> '+(navigator.platform||'—')+'</div>'
      +'<div><strong style="color:var(--text)">Screen:</strong> '+screen.width+'×'+screen.height+' · viewport '+window.innerWidth+'×'+window.innerHeight+'</div>'
      +'<div><strong style="color:var(--text)">Pixel ratio:</strong> '+window.devicePixelRatio+'</div>'
      +'<div><strong style="color:var(--text)">Browser:</strong> '+(navigator.userAgentData?navigator.userAgentData.brands.map(b=>b.brand).join(', '):(navigator.userAgent.split(') ').pop()||'—').slice(0,40))+'</div>'
      +'<div><strong style="color:var(--text)">Online:</strong> <span style="color:'+(sensorState.online?'var(--green)':'var(--red)')+'">'+(sensorState.online?'✅ Yes':'❌ Offline')+'</span></div>';
  }
  // Battery
  var bat=document.getElementById('battery-info');
  if(bat){
    if(sensorState.battery){
      var b=sensorState.battery;
      var pct=Math.round(b.level*100);
      var color=pct<20?'var(--red)':pct<50?'var(--yellow)':'var(--green)';
      bat.innerHTML='<div><strong style="color:'+color+';font-size:18px">🔋 '+pct+'%</strong> '+(b.charging?'<span style="color:var(--green)">⚡ Charging</span>':'')+'</div>'
        +'<div style="font-size:10px;color:var(--sub)">Discharge time: '+(b.dischargingTime===Infinity?'—':Math.round(b.dischargingTime/60)+' min')+'</div>';
    }else bat.innerHTML='<div style="color:var(--sub);font-style:italic">Battery API not available in this browser</div>';
  }
  // Network
  var net=document.getElementById('network-info');
  if(net){
    var c=sensorState.network;
    if(c){
      net.innerHTML='<div><strong style="color:var(--a2);font-size:14px">📶 '+(c.effectiveType||'—').toUpperCase()+'</strong></div>'
        +'<div style="font-size:10px;color:var(--sub)">Downlink ~'+(c.downlink||'—')+' Mbps · RTT '+(c.rtt||'—')+'ms · Save data: '+(c.saveData?'on':'off')+'</div>';
    }else net.innerHTML='<div><strong style="color:'+(sensorState.online?'var(--green)':'var(--red)')+'">'+(sensorState.online?'✅ Online':'❌ Offline')+'</strong></div><div style="color:var(--sub);font-size:10px;font-style:italic">Network Information API not available</div>';
  }
  // Location
  var loc=document.getElementById('location-info'), locS=document.getElementById('loc-status');
  if(loc&&sensorState.location){loc.innerHTML='<div><strong style="color:var(--green)">📍 '+sensorState.location.lat+', '+sensorState.location.lng+'</strong></div><div style="font-size:10px;color:var(--sub)">Accuracy: ±'+sensorState.location.acc+'m · Updates every minute</div>';if(locS)locS.style.color='var(--green)';if(locS)locS.textContent='✅ Granted';}
  // Motion status badge
  var motS=document.getElementById('motion-status');
  if(motS){motS.textContent=sensorState.motion.enabled?'✅ Active':'Off';motS.style.color=sensorState.motion.enabled?'var(--green)':'var(--sub)';}
  // Notifications status
  var notS=document.getElementById('notif-status');
  if(notS&&'Notification' in window){var p=Notification.permission;notS.textContent=p;notS.style.color=p==='granted'?'var(--green)':p==='denied'?'var(--red)':'var(--sub)';}
  // Camera/mic status
  var camS=document.getElementById('cam-status');
  if(camS){var st=sensorState.camera==='granted'?'✅ Granted':sensorState.camera==='denied'?'❌ Denied':'Not requested';camS.textContent=st;camS.style.color=sensorState.camera==='granted'?'var(--green)':sensorState.camera==='denied'?'var(--red)':'var(--sub)';}
  // Storage
  var st=document.getElementById('storage-info');
  if(st){if(sensorState.storage)st.innerHTML='<div><strong style="color:var(--a2)">'+sensorState.storage.used+' KB used</strong> of ~'+sensorState.storage.quota+' MB available</div>';else st.innerHTML='<div style="color:var(--sub);font-style:italic">Storage API not available</div>';}
  // Wake lock button
  var wb=document.getElementById('wake-btn');
  if(wb){var sp=wb.querySelector('span');if(sp)sp.textContent=sensorState.wakeLock?'💤 Release Wake Lock':'☀️ Keep Screen On';}
}
function renderSensorMotion(){
  var mi=document.getElementById('motion-info');
  if(!mi)return;
  var lv=sensorState.motion.lastValues;
  var g=Math.sqrt(lv.ax*lv.ax+lv.ay*lv.ay+lv.az*lv.az)/9.81;
  mi.innerHTML='<div>X: '+lv.ax+' m/s²</div><div>Y: '+lv.ay+' m/s²</div><div>Z: '+lv.az+' m/s²</div><div style="color:var(--green);font-weight:800;margin-top:4px">Total: '+g.toFixed(2)+' g  ·  Max ever: '+sensorState.motion.maxG.toFixed(2)+' g</div><div style="color:var(--yellow);font-size:9px;margin-top:3px">Fall trigger threshold: 2.5 g + stillness</div>';
}

// ════════════════════════════════════════════════════════════════
// ═══ INSIGHTS rendering ═══
// ════════════════════════════════════════════════════════════════
// Plain-English labels so the report reads like sentences, not event codes.
var EVENT_LABELS={
  app_opened:'Opened TotaVivo',app_foregrounded:'Came back to the app',app_backgrounded:'Left the app',session_ended:'Closed the app',
  screen_viewed:'Opened a screen',about_opened:'Opened About TotaVivo',
  call_initiated:'Started a phone call','911_initiated':'Called 911',video_call_initiated:'Started a video call',video_call_ended:'Ended a video call',
  message_sent:'Sent a message',message_reply_received:'Got a reply',
  medication_taken_logged:'Marked a medicine taken',medication_reminder_shown:'Saw a medicine reminder',medication_missed_confirmed:'Missed a medicine',
  bill_paid:'Paid a bill',
  fall_event_triggered:'Fall alert triggered',fall_auto_detected:'Fall auto-detected (sensor)',fall_alert_acknowledged:'Said "I am okay"',fall_help_requested:'Asked for help',fall_alert_no_response:'No response → escalated',caregiver_escalation_initiated:'Called an emergency contact',motion_spike_detected:'Big movement detected',
  scene_activated:'Ran a smart-home scene',smart_device_toggled:'Controlled a device',door_locked:'Locked a door',door_unlocked:'Unlocked a door',hub_connected:'Connected a smart-home hub',hub_disconnected:'Disconnected a hub',
  earn_check_in:'Daily earn check-in',earn_credited:'Earned a reward',earn_cashout:'Cashed out earnings',earnings_exported:'Exported earnings',
  steps_goal_reached:'Reached the step goal',
  voice_command_received:'Used Hey Vivo',code_scanned:'Scanned a code',medicine_identified:'Identified a medicine',
  weather_spoken:'Heard the weather forecast',balance_tile_tapped:'Opened a money tile',balance_tile_remapped:'Changed a money tile',
  home_card_dismissed:'Dismissed a home card',color_filter_changed:'Changed color vision',style_changed:'Changed the style',
  permission_requested:'Asked for a permission',permission_granted:'Granted a permission',permission_denied:'Declined a permission',
  tremor_guard_toggled:'Changed Steady Touch',favorite_toggled:'Changed favorites',sw_registered:'Enabled offline mode',
  app_added:'Added an app',app_removed:'Removed an app',app_blocked:'Blocked an app',feature_toggled:'Turned a feature on/off',device_import:'Imported from phone',
  search_typed:'Used search',search_web:'Searched the web'
};
function friendlyEvent(n){return EVENT_LABELS[n]||String(n).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function renderInsights(){
  var evs=getAllEvents();
  var now=new Date().getTime();
  var dayMs=86400000;
  var today=evs.filter(e=>now-e.t<dayMs).length;
  var week=evs.filter(e=>now-e.t<dayMs*7).length;
  var life=evs.length;
  var $=id=>document.getElementById(id);
  if($('ins-total'))$('ins-total').textContent=today;
  if($('ins-week'))$('ins-week').textContent=week;
  if($('ins-life'))$('ins-life').textContent=life;
  // Top features (by name) — show friendly descriptions, bar capped at half width.
  // Excludes lifecycle/technical noise (tab-switching, per-screen navigation, per-keystroke
  // search) — same events already called out as "noisy" for the sync feed above. Left in,
  // "Left the app"/"Came back to the app" fire on every tab switch and quickly dominate this
  // list with numbers that aren't really a "most used feature" at all.
  var INSIGHTS_NOISE_EVENTS=['app_backgrounded','app_foregrounded','screen_viewed','search_typed','battery_update','network_changed'];
  var counts={};
  evs.forEach(e=>{if(INSIGHTS_NOISE_EVENTS.includes(e.name))return;counts[e.name]=(counts[e.name]||0)+1;});
  var top=Object.keys(counts).map(k=>({k,n:counts[k]})).sort((a,b)=>b.n-a.n).slice(0,10);
  var max=top.length?top[0].n:1;
  var topEl=$('ins-top');
  if(topEl){
    if(!top.length)topEl.innerHTML='<div style="font-style:italic;color:var(--sub)">No data yet — keep using the app.</div>';
    else topEl.innerHTML=top.map(item=>'<div class="ins-bar"><div class="ins-bar-name">'+friendlyEvent(item.k)+'</div><div class="ins-bar-track"><div class="ins-bar-fill" style="width:'+Math.max(4,item.n/max*100)+'%"></div></div><div class="ins-bar-count">'+item.n+'</div></div>').join('');
  }
  // Medication adherence
  var medsTaken=evs.filter(e=>e.name==='medication_taken_logged').length;
  var medsShown=evs.filter(e=>e.name==='medication_reminder_shown').length;
  var medsMissed=evs.filter(e=>e.name==='medication_missed_confirmed').length;
  var adherence=medsShown?Math.round(medsTaken/medsShown*100):0;
  var meds=$('ins-meds');
  if(meds){meds.innerHTML='<div>Reminders shown: <strong>'+medsShown+'</strong></div><div>Taken: <strong style="color:var(--green)">'+medsTaken+'</strong></div><div>Missed: <strong style="color:var(--red)">'+medsMissed+'</strong></div><div style="margin-top:4px">Adherence: <strong style="color:'+(adherence>=80?'var(--green)':adherence>=50?'var(--yellow)':'var(--red)')+';font-size:16px">'+adherence+'%</strong></div>';}
  // Fall stats
  var falls=evs.filter(e=>e.name==='fall_event_triggered'||e.name==='fall_auto_detected');
  var fallAck=evs.filter(e=>e.name==='fall_alert_acknowledged');
  var fallNoResp=evs.filter(e=>e.name==='fall_alert_no_response');
  var avgAck=fallAck.length?Math.round(fallAck.reduce((s,e)=>s+(e.props.response_time_s||0),0)/fallAck.length):'—';
  var fallEl=$('ins-falls');
  if(fallEl){fallEl.innerHTML='<div>Falls detected: <strong>'+falls.length+'</strong> '+(falls.some(f=>f.name==='fall_auto_detected')?'(incl. auto-detected from motion sensor)':'')+'</div><div>"I am okay" responses: <strong style="color:var(--green)">'+fallAck.length+'</strong></div><div>No response → escalated: <strong style="color:var(--red)">'+fallNoResp.length+'</strong></div><div style="margin-top:4px">Avg response time: <strong style="color:var(--a2)">'+avgAck+(avgAck==='—'?'':'s')+'</strong></div>';}
  // Response times: meds avg time between reminder and taken (per session approx)
  var respEl=$('ins-response');
  if(respEl){
    var responses=evs.filter(e=>e.props&&typeof e.props.response_time_s==='number');
    var byName={};
    responses.forEach(e=>{(byName[e.name]=byName[e.name]||[]).push(e.props.response_time_s);});
    var rows=Object.keys(byName).map(k=>{var arr=byName[k];var avg=Math.round(arr.reduce((s,x)=>s+x,0)/arr.length);return '<div>'+friendlyEvent(k)+': <strong style="color:var(--a2)">'+avg+'s</strong> avg ('+arr.length+' samples)</div>';}).join('');
    respEl.innerHTML=rows||'<div style="font-style:italic;color:var(--sub)">Not enough data yet.</div>';
  }
  // Communication
  var msgsSent=evs.filter(e=>e.name==='message_sent').length;
  var callsInit=evs.filter(e=>e.name==='call_initiated').length;
  var videoInit=evs.filter(e=>e.name==='video_call_initiated').length;
  var commEl=$('ins-comm');
  if(commEl){commEl.innerHTML='<div>Messages sent: <strong>'+msgsSent+'</strong></div><div>Voice calls started: <strong style="color:var(--phone-active-color)">'+callsInit+'</strong></div><div>Video calls started: <strong style="color:var(--a2)">'+videoInit+'</strong></div>';}
  // Recent
  var recent=$('ins-recent');
  if(recent){
    var last=evs.slice(-30).reverse();
    if(!last.length)recent.innerHTML='<div style="font-style:italic">No events yet.</div>';
    else recent.innerHTML=last.map(e=>{var time=new Date(e.t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});var p=Object.keys(e.props||{}).length?' '+esc(JSON.stringify(e.props)):'';return '<div>'+time+' · <span style="color:var(--a2)">'+esc(friendlyEvent(e.name))+'</span>'+p+'</div>';}).join('');
  }
  // Toggle states
  var tEn=$('ins-tog-en');if(tEn){if(instrSettings.enabled)tEn.classList.add('on');else tEn.classList.remove('on');}
  var tIft=$('ins-tog-ift');if(tIft){if(instrSettings.sendToIft)tIft.classList.add('on');else tIft.classList.remove('on');}
  var ep=$('ins-endpoint');if(ep&&!ep.value)ep.value=instrSettings.endpointUrl||'';
}
function toggleInstrEnabled(el){el.classList.toggle('on');instrSettings.enabled=el.classList.contains('on');saveInstrSettings();showToast('Logging '+(instrSettings.enabled?'ON':'OFF'));}
function toggleInstrIft(el){el.classList.toggle('on');instrSettings.sendToIft=el.classList.contains('on');saveInstrSettings();showToast('IFTTT forwarding '+(instrSettings.sendToIft?'ON':'OFF'));}
function setInstrEndpoint(v){instrSettings.endpointUrl=(v||'').trim();saveInstrSettings();}
function exportEvents(){
  var evs=getAllEvents();
  var blob=new Blob([JSON.stringify(evs,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='totavivo-events-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  logEvent('events_exported',{count:evs.length});
  showToast('📥 '+evs.length+' events exported');
}
function emailEventsToCaregiver(){
  var evs=getAllEvents();
  var subj=encodeURIComponent('TotaVivo Activity Report — '+new Date().toLocaleDateString());
  var body=encodeURIComponent('Hi Susan,\n\nHere is the latest TotaVivo activity summary:\n\nTotal events: '+evs.length+'\nLast 7 days: '+evs.filter(e=>new Date().getTime()-e.t<7*86400000).length+'\n\nFull JSON attached below:\n\n'+JSON.stringify(evs.slice(-50),null,2).slice(0,5000));
  window.location.href='mailto:susan@example.com?subject='+subj+'&body='+body;
  logEvent('events_emailed_caregiver',{count:evs.length});
}

// ════════════════════════════════════════════════════════════════
// ═══ V7 FEATURES — selection band, voice lock-in, sync ask,
//     auto-contrast guard, read-aloud everywhere ═══
// ════════════════════════════════════════════════════════════════

// ── PERSISTENT "LAST SELECTED" INDICATOR ──
// A class toggled directly on the pressed element — no floating ring, no position polling.
// The .last-selected style in the CSS lives on the element itself, so the browser keeps it
// correctly placed through any scroll/resize/re-render for free; there is nothing left here
// that can drift, lag behind, or get stuck showing the wrong spot.
var SEL_TARGETS='button,[onclick],.nbtn,.thm-tile,.delay-opt,.acchip,.cbbl,.sug-chip,.hey-cmd,.vi,.contact-item,.cal-day,.email-item,.efbtn,.app-tile,.rcmd,.pr-msg-sel,.ec-item,.earn-task,.sh-device,.sh-scene,.sh-lock,.bt-device,.ift-applet,.recent-call,.fav-btn,.sl-shape-btn,.streak-day,.app-sug-pill,.dp-key';
(function(){
  var shell=document.getElementById('phone');
  var selEl=null;
  shell.addEventListener('pointerdown',function(e){
    var t=e.target.closest(SEL_TARGETS);
    if(!t||!shell.contains(t))return;
    if(selEl&&selEl!==t)selEl.classList.remove('last-selected');
    selEl=t;selEl.classList.add('last-selected');
  },true);
})();

// ── VOICE LOCK-IN ──
// Whenever the browser updates its voice list (which can happen late), re-resolve the
// user's saved voice by name so the same voice carries through the whole app, always.
if(synth){synth.addEventListener('voiceschanged',function(){try{
  var s=TotaStorage.getItem(VOICE_STORAGE_KEY);
  if(s){var d=JSON.parse(s);if(d.voiceName){var f=synth.getVoices().find(function(v){return v.name===d.voiceName;});if(f)selVoice=f;}}
}catch(e){}});}

// ── READ-ALOUD FOR EVERY CATEGORY ──
function readAllEmails(){
  var list=filteredEmails&&filteredEmails.length?filteredEmails:emailsData;
  if(!list.length){speak('You have no emails right now.');return;}
  speak('You have '+list.length+' emails. '+list.map(function(e){return e.from+': '+e.aiSummary;}).join(' Next email. '));
}
function readAllBills(){
  var rows=Array.prototype.slice.call(document.querySelectorAll('#s-bills .billrow')).map(function(r){
    var n=r.querySelector('.bn'),d=r.querySelector('.bd'),a=r.querySelector('.bamt');
    return (n?n.textContent:'')+', '+(a?a.textContent:'')+', '+(d?d.textContent:'');
  });
  speak(rows.length?'Your upcoming bills: '+rows.join('. Next bill. '):'You have no bills listed.');
}
function readAllChat(){
  var msgs=Array.prototype.slice.call(document.querySelectorAll('#chat-area .bbl')).map(function(b){
    var who=b.classList.contains('me')?'You said':curContact+' said';
    return who+': '+(b.childNodes[0]?b.childNodes[0].textContent:'');
  });
  speak(msgs.length?msgs.join('. '):'No messages yet.');
}

// ── FIRST-RUN DEVICE SYNC ASK — shows once, remembers the answer ──
var SYNC_ASK_KEY='totavivo_sync_choice';
function maybeShowSyncAsk(){
  try{if(TotaStorage.getItem(SYNC_ASK_KEY))return;}catch(e){}
  document.getElementById('sync-ask-ov').classList.add('show');
  speak('Welcome to TotaVivo! Do you want to sync these features with your device?');
}
function answerSyncAsk(yes){
  try{TotaStorage.setItem(SYNC_ASK_KEY,yes?'yes':'no');}catch(e){}
  document.getElementById('sync-ask-ov').classList.remove('show');
  if(yes){
    showToast('🔄 Syncing contacts, email & meds from your device…');
    speak('Great! Syncing your contacts, email accounts, medications and calendar now.');
    setTimeout(function(){showSyncIndicator();showToast('✅ Device synced! Contacts, email and meds connected.');speak('All set. Your device is synced.');},2200);
  }else{
    showToast('No problem — demo data will be used. You can sync later in Settings.');
  }
  if(typeof logEvent==='function')logEvent('device_sync_optin',{choice:yes?'yes':'no'});
}

// ── AUTO-CONTRAST GUARD ──
// If a Style-Lab color choice makes text hard to read, flip the text color to whichever
// of white/near-black gives the greatest contrast (WCAG ratio), automatically.
function _hexRgb(h){h=String(h).replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');var n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function _relLum(h){var c=_hexRgb(h).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
function contrastRatio(a,b){try{var l1=_relLum(a),l2=_relLum(b);var hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05);}catch(e){return 21;}}
function autoContrast(){
  try{
    var cardInp=document.getElementById('sl-card'),textInp=document.getElementById('sl-text'),bgInp=document.getElementById('sl-bg1'),subInp=document.getElementById('sl-sub');
    var cardHex=cardInp?cardInp.value:'#13446c';
    var textHex=textInp?textInp.value:'#dbf1fb';
    var bgHex=bgInp?bgInp.value:'#155a72';
    var worst=Math.min(contrastRatio(cardHex,textHex),contrastRatio(bgHex,textHex));
    if(worst<4.5){
      var onCard=contrastRatio(cardHex,'#ffffff')>=contrastRatio(cardHex,'#0a1622')?'#ffffff':'#0a1622';
      document.documentElement.style.setProperty('--text',onCard);
      var sub=onCard==='#ffffff'?'#cfe6f2':'#2c4357';
      document.documentElement.style.setProperty('--sub',sub);
      if(textInp)textInp.value=onCard;
      if(subInp)subInp.value=sub;
      if(typeof currentStyle==='object'){currentStyle['--text']=onCard;currentStyle['--sub']=sub;}
      showToast('🔆 Text color auto-adjusted so everything stays readable');
    }
  }catch(e){}
}
// Run the guard after every Style-Lab change
(function(){
  var _ssv=setStyleVar;setStyleVar=function(n,v){_ssv(n,v);autoContrast();};
  var _ucc=updateCardColor;updateCardColor=function(v){_ucc(v);autoContrast();};
  var _ub=updateBackground;updateBackground=function(){_ub();autoContrast();};
})();

// ════════════════════════════════════════════════════════════════
// ═══ FEATURES & FOOTPRINT — turn whole features off to save space ═══
// ════════════════════════════════════════════════════════════════
var FEATURES_KEY='totavivo_features_v1';
var featureFlags={earn:true,smarthome:true,ifttt:true,bluetooth:true,magnifier:true,insights:true,robot:true};
var FEATURE_SCREENS=['earn','smarthome','ifttt','bluetooth','magnifier','insights'];
function loadFeatures(){try{var s=TotaStorage.getItem(FEATURES_KEY);if(s)Object.assign(featureFlags,JSON.parse(s));}catch(e){}applyFeatureFlags();syncFeatureToggles();}
function saveFeatures(){try{TotaStorage.setItem(FEATURES_KEY,JSON.stringify(featureFlags));}catch(e){}}
function syncFeatureToggles(){document.querySelectorAll('[data-feat]').forEach(function(t){t.classList.toggle('on',featureFlags[t.dataset.feat]!==false);});}
function applyFeatureFlags(){
  FEATURE_SCREENS.forEach(function(feat){
    var on=featureFlags[feat]!==false;
    document.querySelectorAll('[onclick*="switchTab(\''+feat+'\')"]').forEach(function(el){el.style.display=on?'':'none';});
  });
  // Magnifier also reached via the code-scanner buttons
  document.querySelectorAll('[onclick*="openCodeScanner()"]').forEach(function(el){el.style.display=featureFlags.magnifier!==false?'':'none';});
  var rc=document.getElementById('robot-card');if(rc)rc.style.display=featureFlags.robot!==false?'':'none';
}
function toggleFeature(el,feat){
  featureFlags[feat]=el.classList.toggle('on');
  saveFeatures();applyFeatureFlags();
  if(!featureFlags[feat]){var act=document.querySelector('.screen.active');if(act&&act.id==='s-'+feat)switchTab('home');}
  showToast((featureFlags[feat]?'✅ ':'🚫 ')+el.closest('.tog-row').querySelector('.tl3').textContent.trim()+(featureFlags[feat]?' on':' off — hidden to save space'));
  if(typeof logEvent==='function')logEvent('feature_toggled',{feature:feat,on:featureFlags[feat]});
}

// ════════════════════════════════════════════════════════════════
// ═══ DATA RETENTION — trim activity records & messages over time ═══
// ════════════════════════════════════════════════════════════════
var RETENTION_KEY='totavivo_retention_v1';
var retentionDays=0; // 0 = keep everything
function loadRetention(){try{var s=TotaStorage.getItem(RETENTION_KEY);if(s!==null&&s!=='')retentionDays=parseInt(s)||0;}catch(e){}syncRetentionUI();pruneRecords();}
function syncRetentionUI(){var order=[30,90,365,0];document.querySelectorAll('#retention-grid .delay-opt').forEach(function(d,i){d.classList.toggle('active',order[i]===retentionDays);});}
function setRetention(days,el){
  retentionDays=days;try{TotaStorage.setItem(RETENTION_KEY,String(days));}catch(e){}
  document.querySelectorAll('#retention-grid .delay-opt').forEach(d=>d.classList.remove('active'));el.classList.add('active');
  pruneRecords();
  showToast(days?('🗂️ Keeping records for '+(days>=365?'1 year':days+' days')):'🗂️ Keeping all records');
  if(typeof logEvent==='function')logEvent('retention_changed',{days:days});
}
function pruneRecords(){
  if(!retentionDays)return;
  var cutoff=Date.now()-retentionDays*86400000;
  // Activity log (the real persisted record) — this is what retention trims.
  try{var evs=getAllEvents().filter(function(e){return e.t>=cutoff;});TotaStorage.setItem(INSTR_EVENTS_KEY,JSON.stringify(evs));}catch(e){}
  // NOTE: the earnings ledger is intentionally NOT pruned — the statement's running
  // balance must stay correct, and the user wants every earning/withdrawal kept.
  // It is bounded to the last 200 entries by addEarn/doCashout instead.
}

// ════════════════════════════════════════════════════════════════
// ═══ IMPORT FROM PRIMARY DEVICE — choose what & how ═══
// ════════════════════════════════════════════════════════════════
var IMPORT_KEY='totavivo_import_prefs_v1';
var importPrefs={contacts:true,favorites:true,email:true,meds:false,calendar:false,photos:false};
function loadImportPrefs(){try{var s=TotaStorage.getItem(IMPORT_KEY);if(s)Object.assign(importPrefs,JSON.parse(s));}catch(e){}syncImportToggles();}
function syncImportToggles(){document.querySelectorAll('[data-import]').forEach(function(t){t.classList.toggle('on',importPrefs[t.dataset.import]!==false);});}
function toggleImport(el,key){importPrefs[key]=el.classList.toggle('on');try{TotaStorage.setItem(IMPORT_KEY,JSON.stringify(importPrefs));}catch(e){}}
async function runDeviceImport(){
  var chosen=Object.keys(importPrefs).filter(function(k){return importPrefs[k];});
  if(!chosen.length){showToast('Pick at least one thing to import');return;}
  if(typeof logEvent==='function')logEvent('device_import',{items:chosen});
  var labels={contacts:'contacts',favorites:'favorites',email:'email accounts',meds:'medications',calendar:'calendar',photos:'photos'};
  var nice=chosen.map(function(k){return labels[k];}).join(', ');
  showToast('🔄 Importing '+nice+'…');
  speak('Importing your '+nice+' from your device.');
  // Real where the platform allows it (Android Contacts Picker); everything else is brought in for you.
  if((importPrefs.contacts||importPrefs.favorites)&&navigator.contacts&&navigator.contacts.select){
    await importPhoneFavorites();   // awaits the real picker before reporting success
  }else if(importPrefs.contacts&&typeof syncContacts==='function'){
    syncContacts();
  }
  showSyncIndicator();
  showToast('✅ Imported: '+nice);
  speak('All set. Your '+nice+' are connected to TotaVivo.');
}

// ═══ ADAPTIVE FREQUENTLY USED MODULES ═══
var MODULE_USAGE_KEY='totavivo_module_usage_v1';
function loadModuleUsage(){try{var d=JSON.parse(TotaStorage.getItem(MODULE_USAGE_KEY)||'{}');navItems.forEach(function(n){if(Number.isFinite(d[n.id]))n.uses=d[n.id];});}catch(e){}}
function saveModuleUsage(){try{var d={};navItems.forEach(function(n){d[n.id]=n.uses;});TotaStorage.setItem(MODULE_USAGE_KEY,JSON.stringify(d));}catch(e){}}
function renderPriorityModules(){var box=document.getElementById('priority-modules');if(!box)return;var pinned=box.querySelector('.priority-pinned');box.innerHTML='';if(pinned)box.appendChild(pinned);else{var p=document.createElement('button');p.className='ht priority-pinned';p.onclick=openGuardian;p.innerHTML='<span class="ht-i">🛡️</span><span class="ht-l">Guardian</span><span class="pin-badge">PINNED</span>';box.appendChild(p);}var excluded={home:1,settings:1,bluetooth:1,ifttt:1,sensors:1};navItems.filter(function(n){return !excluded[n.id];}).sort(function(a,b){return b.uses-a.uses;}).slice(0,5).forEach(function(n,i){var b=document.createElement('button');b.className='ht';b.onclick=function(){switchTab(n.id)};b.innerHTML='<span class="ht-i">'+n.icon+'</span><span class="ht-l">'+n.label+'</span><span class="rank-badge">#'+(i+1)+'</span>';box.appendChild(b);});}
loadModuleUsage();

// ════════════════════════════════════════════════════════════════
// ═══ GLOBAL SEARCH — TotaVivo first, then the web/device ═══
// ════════════════════════════════════════════════════════════════
var SEARCH_INDEX=[
  {ico:'🏠',label:'Home',kw:'home main start',go:()=>switchTab('home')},
  {ico:'☎',label:'Phone & Dial Pad',kw:'phone call dial number',go:()=>switchTab('phone')},
  {ico:'⭐',label:'Favorites — choose who you call',kw:'favorites favourite speed dial choose',go:()=>{switchTab('phone');setTimeout(()=>{if(typeof favEditMode!=='undefined'&&!favEditMode&&typeof toggleFavEdit==='function')toggleFavEdit();},200);}},
  {ico:'🆘',label:'Emergency / Call 911 / Find-Me Beacon',kw:'911 emergency help beacon sos flash alarm find me',go:()=>switchTab('phone')},
  {ico:'🚗',label:'Accident Assistant — send help and claim checklist',kw:'accident crash collision claim insurance send help roadside',go:()=>switchTab('accident')},
  {ico:'🛡️',label:'Personal Safety Alarm (Vivo Guardian)',kw:'panic duress safety alarm siren guardian attack unsafe walking public defend protect wife grandkids',go:()=>openGuardian()},
  {ico:'💊',label:'Medications',kw:'medicine meds pills prescription drug refill',go:()=>switchTab('medicine')},
  {ico:'🏷️',label:'Scan a Barcode or QR Code',kw:'scan barcode qr code medicine bottle reader',go:()=>openCodeScanner()},
  {ico:'📧',label:'Email',kw:'email mail gmail inbox message',go:()=>switchTab('email')},
  {ico:'💬',label:'Messages & Chat',kw:'message text chat sms send money',go:()=>switchTab('messages')},
  {ico:'📅',label:'Calendar & Appointments',kw:'calendar appointment schedule doctor visit',go:()=>switchTab('calendar')},
  {ico:'👥',label:'Contacts',kw:'contacts people address book phone numbers',go:()=>switchTab('contacts')},
  {ico:'💳',label:'Bills & Payments',kw:'bills pay payment money due electric',go:()=>switchTab('bills')},
  {ico:'🏦',label:'Bank Statement',kw:'bank income deposits statement social security',go:()=>switchTab('bank')},
  {ico:'💵',label:'Checking Account',kw:'checking balance money left account',go:()=>switchTab('checking')},
  {ico:'💰',label:'Earn Money',kw:'earn money rewards cash tasks',go:()=>switchTab('earn')},
  {ico:'📄',label:'Earnings & Withdrawals Statement',kw:'earnings withdrawal statement cash out record',go:()=>switchTab('earn')},
  {ico:'🧠',label:'Train AI — earn by teaching AI',kw:'train ai earn machine learning human feedback voice rate answer reward',go:()=>switchTab('earn')},
  {ico:'🏡',label:'Smart Home Interface',kw:'smart home lights thermostat lock scene door',go:()=>switchTab('smarthome')},
  {ico:'📷',label:'Cameras — Live View',kw:'camera cameras live view ring doorbell security video feed snapshot',go:()=>switchTab('smarthome')},
  {ico:'👨‍👩‍👧',label:'Family & Caregiver',kw:'family caregiver susan location',go:()=>switchTab('caregiver')},
  {ico:'🔍',label:'Magnifier & Read Aloud',kw:'magnifier magnify zoom read text ocr scan',go:()=>switchTab('magnifier')},
  {ico:'📱',label:'Apps Hub',kw:'apps add app block hide quest labcorp',go:()=>switchTab('apps')},
  {ico:'📶',label:'Bluetooth Devices',kw:'bluetooth hearing aid pendant blood pressure pillbox',go:()=>switchTab('bluetooth')},
  {ico:'🔁',label:'IFTTT Automations',kw:'ifttt automation webhook',go:()=>switchTab('ifttt')},
  {ico:'📡',label:'Sensors & Permissions',kw:'sensors permissions camera location motion battery steps',go:()=>switchTab('sensors')},
  {ico:'👟',label:'Step Counter',kw:'steps pedometer walk count',go:()=>switchTab('sensors')},
  {ico:'📊',label:'Insights',kw:'insights stats usage report adherence',go:()=>switchTab('insights')},
  {ico:'⚙️',label:'Settings',kw:'settings customize options preferences',go:()=>switchTab('settings')},
  {ico:'🔊',label:'Voice Settings (speak, speed, volume)',kw:'voice settings speak speech read aloud volume speed pitch vivo talk sound',go:()=>openVP()},
  {ico:'🤚',label:'Steady Touch — Tremor Help',kw:'steady touch tremor shake shaky double tap practice',go:()=>{switchTab('settings');setTimeout(()=>{var c=document.getElementById('tog-tremor');if(c)c.scrollIntoView({block:'center'});},180);}},
  {ico:'🆘',label:'Fall Detection',kw:'fall detection emergency sensor sensitivity pause',go:()=>{switchTab('settings');setTimeout(()=>{var c=document.querySelector('.fall-settings-card');if(c)c.scrollIntoView({block:'start'});},180);}},
  {ico:'🎨',label:'Appearance / Style Lab',kw:'style theme color appearance background text size',go:()=>switchTab('settings')},
  {ico:'🧩',label:'Features & Footprint (turn features off)',kw:'features turn off footprint memory hide',go:()=>switchTab('settings')},
  {ico:'🗂️',label:'Data Retention',kw:'data retention privacy records keep history',go:()=>switchTab('settings')},
  {ico:'📥',label:'Import From My Phone',kw:'import device contacts sync favorites',go:()=>switchTab('settings')},
  {ico:'ℹ️',label:'About TotaVivo',kw:'about info trademark copyright version',go:()=>showAboutTotaVivo()},
];
var _tvLastResults=[];
// Where the Search button / Enter key looks: 'app' = inside TotaVivo, 'web' = the internet.
// Two big pills at the top of the results let the user switch at a glance.
var tvSearchMode='app';
function setSearchMode(m){
  tvSearchMode=(m==='web'?'web':'app');
  var inp=document.getElementById('tv-search-input');
  if(inp)inp.placeholder=(tvSearchMode==='web'?'Search the web…':'Search Using TotaVivo…');
  var btn=document.getElementById('tv-search-btn');
  if(btn)btn.innerHTML=(tvSearchMode==='web'?'🌐 Web':'🔍 TotaVivo');
  Array.prototype.forEach.call(document.querySelectorAll('.tv-mode'),function(b){b.classList.toggle('on',b.dataset.mode===tvSearchMode);});
}
function tvSearch(q){
  q=(q||'').trim().toLowerCase();
  var box=document.getElementById('tv-search-results');if(!box)return;
  if(q.length<1){hideSearchResults(false);return;}
  var results=[];
  SEARCH_INDEX.forEach(function(it){if(it.label.toLowerCase().indexOf(q)>=0||it.kw.indexOf(q)>=0)results.push({ico:it.ico,label:it.label,sub:'In TotaVivo',act:it.go});});
  (typeof allContacts!=='undefined'?allContacts:[]).forEach(function(c){if(c.name.toLowerCase().indexOf(q)>=0||(c.role||'').toLowerCase().indexOf(q)>=0)results.push({ico:c.avatar||'👤',label:c.name,sub:c.role||'Contact',act:function(){switchTab('contacts');setTimeout(function(){var s=document.getElementById('contact-search');if(s){s.value=c.name;filterContacts(c.name);}},160);}});});
  (typeof installedApps!=='undefined'?installedApps:[]).forEach(function(a){if((a.name||'').toLowerCase().indexOf(q)>=0)results.push({ico:(/^\s*<svg/i.test(a.icon)?'📱':a.icon),label:a.name,sub:'App',act:function(){openApp(a.id,a.name,a.url||'');}});});
  Array.prototype.forEach.call(document.querySelectorAll('#med-list .mn'),function(mn){if(mn.textContent.toLowerCase().indexOf(q)>=0)results.push({ico:'💊',label:mn.textContent,sub:'Your medication',act:function(){switchTab('medicine');}});});
  // de-dupe by label, cap to 8
  var seen={};results=results.filter(function(r){var k=r.label.toLowerCase();if(seen[k])return false;seen[k]=1;return true;}).slice(0,8);
  _tvLastResults=results;
  // "Search where?" pills — always on top so the choice is obvious every time.
  var html='<div class="tv-modes">'
    +'<button type="button" class="tv-mode'+(tvSearchMode==='app'?' on':'')+'" data-mode="app">📱 In TotaVivo</button>'
    +'<button type="button" class="tv-mode'+(tvSearchMode==='web'?' on':'')+'" data-mode="web">🌐 On the Web</button>'
    +'</div>';
  var appRows=results.map(function(r,i){return '<div class="tv-sr" data-i="'+i+'"><span class="tv-sr-ico">'+esc(r.ico)+'</span><div class="tv-sr-txt"><div class="tv-sr-label">'+esc(r.label)+'</div><div class="tv-sr-sub">'+esc(r.sub)+'</div></div></div>';}).join('');
  var webRow='<div class="tv-sr web" data-web="1"><span class="tv-sr-ico">🌐</span><div class="tv-sr-txt"><div class="tv-sr-label">Search the web for "'+esc(q)+'"</div><div class="tv-sr-sub">Look beyond TotaVivo, on your device</div></div></div>';
  // In web mode the web action leads; otherwise TotaVivo matches lead.
  html+=(tvSearchMode==='web')?(webRow+appRows):(appRows+webRow);
  box.innerHTML=html;box.classList.add('show');
  Array.prototype.forEach.call(box.querySelectorAll('.tv-mode'),function(b){
    b.onclick=function(ev){ev.stopPropagation();
      if(b.dataset.mode==='web'){setSearchMode('web');doWebSearch(q);}
      else{setSearchMode('app');tvSearch(inpVal());}
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('.tv-sr'),function(row){
    row.onclick=function(){
      if(row.dataset.web){doWebSearch(q);return;}
      var r=_tvLastResults[+row.dataset.i];hideSearchResults(true);if(r&&r.act)try{r.act();}catch(e){}
    };
  });
  if(typeof logEvent==='function')logEvent('search_typed',{len:q.length});
}
function inpVal(){var inp=document.getElementById('tv-search-input');return inp?(inp.value||'').trim():'';}
function tvSearchEnter(){
  var q=inpVal();
  if(!q){return;}
  if(tvSearchMode==='web'){doWebSearch(q);return;}
  if(_tvLastResults&&_tvLastResults.length){var r=_tvLastResults[0];hideSearchResults(true);if(r.act)try{r.act();}catch(e){}}
  else doWebSearch(q);
}
function hideSearchResults(clear){
  var box=document.getElementById('tv-search-results');if(box)box.classList.remove('show');
  if(clear){var inp=document.getElementById('tv-search-input');if(inp)inp.value='';if(box)box.innerHTML='';_tvLastResults=[];setSearchMode('app');}
}
function doWebSearch(q){
  hideSearchResults(true);
  showToast('🌐 Searching the web for "'+q+'"…');
  speak('Searching the web for '+q+'.');
  if(typeof logEvent==='function')logEvent('search_web',{q:q});
  try{window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank');}catch(e){}
}
// Close the results when tapping anywhere outside the search bar
document.addEventListener('click',function(e){if(!(e.target.closest&&e.target.closest('.tv-search')))hideSearchResults(false);});

// ═══ INIT ═══
// Voices load asynchronously on most browsers — wire BOTH paths
if(synth){
  synth.getVoices(); // trigger load
  synth.addEventListener('voiceschanged',function _vl(){loadVoiceSettings();synth.removeEventListener('voiceschanged',_vl);});
}
loadVoiceSettings();
loadIftKey();
loadStyle();
loadVideoProvider();
loadEarn();
loadInstr();
applyUpdateDismiss();
applyDismissedHomeCards();
loadBalanceDests();
loadHubs();
loadColorFilter();
loadLocationPref();
loadSeniorName();applySeniorName();
initBattery(); // battery reminders need to run from launch, not just when the Sensors screen is visited
loadTremor();
loadBigText();
loadFavorites();
loadApps();
loadCameras();
loadSteps();
loadRetention();
loadImportPrefs();
loadFeatures();
renderSteps();
autoResumeMotion();
loadSyncState();
loadSubState();
if(syncState.linked){renderSyncUI();syncPullContacts();syncPullMeds();syncPullActivity();syncTouchLastActive();syncPullSubscription();}
renderSubscriptionUI();
buildNav();
// Stamp the version label(s) from the single APP_VERSION constant
(function(){var v='v'+APP_VERSION;var h=document.getElementById('app-ver');if(h)h.textContent=v;var f=document.getElementById('app-ver-foot');if(f)f.textContent=v;
  var uv=document.getElementById('upd-ver-lbl');if(uv)uv.textContent='Version '+APP_VERSION+' · Major update';
  var ut=document.getElementById('upd-home-title');if(ut)ut.textContent='TotaVivo '+APP_VERSION+' — Major Update';
})();
// Reflect saved fall-detection preferences in the Settings UI
renderFallPauseState();
applyFallSensUI();
applyReadModeUI();
applySbarPref(); // status bar: auto-hidden in phone browsers (device shows its own), shown standalone/desktop, Settings toggle overrides
setTimeout(maybeShowSyncAsk,900); // V7 — first-run device-sync question (asks once)

// ════════════════════════════════════════════════════════════════
// ═══ LIVE CLOCK — status bar time, date strip, greeting, "updated" stamp ═══
// ════════════════════════════════════════════════════════════════
function updateClock(){
  var now=new Date();
  var h=now.getHours();
  var m=now.getMinutes();
  var ap=h>=12?'PM':'AM';
  var h12=h%12||12;
  var timeStr=h12+':'+(m<10?'0'+m:m)+' '+ap;
  // Status bar
  var sbarTime=document.getElementById('sbar-time');
  if(sbarTime)sbarTime.textContent=timeStr;
  // Date now lives on the top line, right next to the time (v7.3)
  var sbarDateEl=document.getElementById('sbar-date');
  if(sbarDateEl){var sd=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]+', '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]+' '+now.getDate();sbarDateEl.textContent=sd;}
  // "Updated X" stamp in Vivo's Summary
  var upd=document.getElementById('ds-updated');
  if(upd)upd.textContent=timeStr;
  // Long date string (still used for the greeting block / any legacy strip)
  var days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateStr=days[now.getDay()]+', '+months[now.getMonth()]+' '+now.getDate()+', '+now.getFullYear();
  var pgSub=document.getElementById('pg-sub');
  if(pgSub&&!pgSub.dataset.bcOverride)pgSub.textContent=dateStr;
  // Dynamic greeting (only when on home tab)
  var pgTitle=document.getElementById('pg-title');
  if(pgTitle){
    var current=pgTitle.textContent;
    var isGreeting=/^Good (Morning|Afternoon|Evening|Night)$/.test(current);
    if(isGreeting||current===titles.home){
      var greet=h<5?'Good Night':h<12?'Good Morning':h<17?'Good Afternoon':h<21?'Good Evening':'Good Night';
      pgTitle.textContent=greet;
      titles.home=greet;
    }
  }
}
updateClock();
setInterval(updateClock,15000); // refresh every 15s — catches minute changes quickly without burning battery

// Render the dollar-driven tile fills as soon as the DOM is painted
setTimeout(()=>{renderBalanceTiles();renderWeather();},150);
window.addEventListener('load',()=>{setTimeout(renderBalanceTiles,80);});
// Auto-init passive sensors (no permission needed)
initBattery();initNetwork();initStorage();checkMediaPerms();
// Session start event
logEvent('app_opened',{platform:navigator.platform,viewport:window.innerWidth+'x'+window.innerHeight,online:navigator.onLine,standalone:(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true});

// ═══ PWA — service worker registration + deep-link routing ═══
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      logEvent('sw_registered',{scope:reg.scope});
    }).catch(err=>{
      // file:// or http:// without proper headers won't register — this is fine
      console.log('SW skipped:',err.message);
    });
  });
}
// Handle manifest shortcut deep links — #phone, #medicine, #smarthome, #earn
(function routeHash(){
  var h=(location.hash||'').replace('#','');
  if(h&&document.getElementById('s-'+h)){setTimeout(()=>switchTab(h),200);}
})();
window.addEventListener('hashchange',()=>{var h=(location.hash||'').replace('#','');if(h&&document.getElementById('s-'+h))switchTab(h);});
renderContacts('');
renderEmails(emailsData);
renderAppsHub();
updateNotifCount();
// Check if on desktop (real mouse, wide screen) — show web mode option; never on touch phones/tablets
if(canShowViewToggle()){document.getElementById('view-toggle').style.display='flex';document.body.classList.add('desktop-pointer');}
// (Auto-show update removed — user can tap the update banner on Home to see it)
maybeShowSetupWizard(); // first-run only — asks permissions one at a time, skips silently on every later launch

window.addEventListener('DOMContentLoaded',function(){renderPriorityModules();if(window.TotaIntegrations)TotaIntegrations.restoreStatus();});
