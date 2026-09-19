/* TotaVivo reliability layer: sanitized telemetry, crash capture and offline delivery. */
(function(root){
  'use strict';
  var QUEUE_KEY='totavivo_telemetry_queue_v1';
  var INSTALL_KEY='totavivo_install_id_v1';
  var MAX_QUEUE=250;
  var client=null,version='unknown',flushing=false;
  var denied=/name|email|phone|address|location|lat|lng|med|message|record|contact|amount|balance|password|token|secret/i;
  function store(){return root.TotaStorage||null;}
  function installId(){
    var s=store(),id=s&&s.getItem(INSTALL_KEY);if(id)return id;
    id='i_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
    if(s)s.setItem(INSTALL_KEY,id);return id;
  }
  function cleanText(value){
    return String(value||'').replace(/https?:\/\/\S+/gi,'[url]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\+?\d[\d ().-]{7,}\d/g,'[phone]').slice(0,300);
  }
  function safeProps(input){
    var out={};Object.keys(input||{}).slice(0,20).forEach(function(key){
      if(denied.test(key))return;
      var value=input[key];
      if(typeof value==='number'||typeof value==='boolean')out[key]=value;
      else if(typeof value==='string')out[key]=cleanText(value).slice(0,100);
    });return out;
  }
  function queue(){var s=store();if(!s)return[];var q=s.getJSON(QUEUE_KEY,[]);return Array.isArray(q)?q:[];}
  function save(q){var s=store();if(s)s.setJSON(QUEUE_KEY,q.slice(-MAX_QUEUE));renderStatus(q.length);}
  function renderStatus(count){
    var bar=document.getElementById('network-status');if(!bar)return;
    var offline=!navigator.onLine;
    bar.classList.toggle('show',offline||count>0);bar.classList.toggle('offline',offline);
    bar.textContent=offline?'Offline — changes stay on this device and sync when connected':(count?count+' technical report'+(count===1?'':'s')+' waiting to sync':'');
  }
  function enqueue(kind,name,props){
    var q=queue();q.push({
      install_id:installId(),session_id:(root.sessionId||null),event_kind:kind,event_name:String(name||'unknown').slice(0,80),
      app_version:version,route:(location.hash||'#home').slice(0,60),online:navigator.onLine,
      occurred_at:new Date().toISOString(),details:safeProps(props)
    });save(q);if(navigator.onLine)flush();
  }
  async function flush(){
    if(flushing||!client||!navigator.onLine)return false;
    var q=queue();if(!q.length){renderStatus(0);return true;}
    flushing=true;
    try{
      var batch=q.slice(0,25),res=await client.from('app_telemetry').insert(batch);
      if(res.error)throw res.error;
      save(q.slice(batch.length));flushing=false;
      if(queue().length)setTimeout(flush,250);return true;
    }catch(_){flushing=false;renderStatus(q.length);return false;}
  }
  function configure(options){options=options||{};client=options.client||client;version=options.version||version;renderStatus(queue().length);if(navigator.onLine)flush();}
  function captureError(error,source){
    var e=error instanceof Error?error:new Error(cleanText(error));
    enqueue('crash','unhandled_error',{source:source||'window',message:cleanText(e.message),stack:cleanText(e.stack)});
  }
  root.addEventListener('error',function(ev){captureError(ev.error||ev.message,'window');});
  root.addEventListener('unhandledrejection',function(ev){captureError(ev.reason,'promise');});
  root.addEventListener('online',function(){renderStatus(queue().length);flush();});
  root.addEventListener('offline',function(){renderStatus(queue().length);});
  setInterval(function(){if(navigator.onLine)flush();},60000);
  root.TotaReliability={configure:configure,track:function(name,props){enqueue('analytics',name,props);},captureError:captureError,flush:flush,pending:function(){return queue().length;}};
})(typeof window!=='undefined'?window:globalThis);
