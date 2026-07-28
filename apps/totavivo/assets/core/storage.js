/* TotaVivo 8.2 shared storage layer.
   One guarded API for durable/session state, JSON values, migrations, export and recovery. */
(function(root){
  'use strict';
  function memoryStore(){
    var data=Object.create(null);
    return {
      getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},
      setItem:function(k,v){data[k]=String(v);},
      removeItem:function(k){delete data[k];},
      clear:function(){data=Object.create(null);},
      key:function(i){return Object.keys(data)[i]||null;},
      get length(){return Object.keys(data).length;}
    };
  }
  function usable(candidate){
    if(!candidate)return false;
    try{var k='__tota_storage_test__';candidate.setItem(k,'1');candidate.removeItem(k);return true;}catch(_){return false;}
  }
  function facade(candidate,label){
    var nativeStore=usable(candidate)?candidate:memoryStore();
    var fallback=nativeStore!==candidate;
    return {
      kind:label,
      isFallback:fallback,
      getItem:function(k){try{return nativeStore.getItem(String(k));}catch(_){return null;}},
      setItem:function(k,v){try{nativeStore.setItem(String(k),String(v));return true;}catch(_){return false;}},
      removeItem:function(k){try{nativeStore.removeItem(String(k));return true;}catch(_){return false;}},
      clear:function(){try{nativeStore.clear();return true;}catch(_){return false;}},
      key:function(i){try{return nativeStore.key(i);}catch(_){return null;}},
      get length(){try{return nativeStore.length||0;}catch(_){return 0;}},
      getJSON:function(k,fallbackValue){var raw=this.getItem(k);if(raw===null)return fallbackValue;try{return JSON.parse(raw);}catch(_){return fallbackValue;}},
      setJSON:function(k,value){try{return this.setItem(k,JSON.stringify(value));}catch(_){return false;}},
      updateJSON:function(k,updater,fallbackValue){var current=this.getJSON(k,fallbackValue);var next=updater(current);this.setJSON(k,next);return next;},
      export:function(prefix){var out={};for(var i=0;i<this.length;i++){var key=this.key(i);if(key&&(!prefix||key.indexOf(prefix)===0))out[key]=this.getItem(key);}return out;},
      import:function(values,options){options=options||{};var count=0;Object.keys(values||{}).forEach(function(k){if(options.prefix&&k.indexOf(options.prefix)!==0)return;if(!options.overwrite&&nativeStore.getItem(k)!==null)return;nativeStore.setItem(k,String(values[k]));count++;});return count;}
    };
  }
  var persistent=facade(root.localStorage,'persistent');
  var session=facade(root.sessionStorage,'session');
  var migrations=[];
  var api={
    version:'8.2.0',
    persistent:persistent,
    session:session,
    registerMigration:function(id,run){migrations.push({id:id,run:run});},
    runMigrations:function(){
      var applied=persistent.getJSON('totavivo_storage_migrations',[]);if(!Array.isArray(applied))applied=[];
      migrations.forEach(function(m){if(applied.indexOf(m.id)!==-1)return;try{m.run(api);applied.push(m.id);}catch(err){if(root.console)console.warn('Tota storage migration failed:',m.id,err);}});
      persistent.setJSON('totavivo_storage_migrations',applied);return applied.slice();
    },
    backup:function(){return {schema:1,createdAt:new Date().toISOString(),persistent:persistent.export('totavivo_')};},
    restore:function(backup,overwrite){if(!backup||backup.schema!==1||!backup.persistent)throw new Error('Invalid TotaVivo backup');return persistent.import(backup.persistent,{prefix:'totavivo_',overwrite:!!overwrite});}
  };
  // Backward-compatible Storage-like aliases. The main app uses these directly.
  ['getItem','setItem','removeItem','clear','key','getJSON','setJSON','updateJSON'].forEach(function(name){api[name]=function(){return persistent[name].apply(persistent,arguments);};});
  Object.defineProperty(api,'length',{get:function(){return persistent.length;}});
  root.TotaStorage=api;
  root.TotaSession=session;
})(typeof window!=='undefined'?window:globalThis);
