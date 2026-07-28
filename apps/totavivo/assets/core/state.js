/* TotaVivo 8.2 shared state/event layer. */
(function(root){
  'use strict';
  var state=Object.create(null), listeners=Object.create(null), modules=Object.create(null);
  function emit(topic,payload){(listeners[topic]||[]).slice().forEach(function(fn){try{fn(payload,topic);}catch(err){if(root.console)console.error(err);}});}
  var api={
    version:'8.2.0',
    get:function(path,fallback){var cur=state;for(var p of String(path).split('.')){if(cur==null||!Object.prototype.hasOwnProperty.call(cur,p))return fallback;cur=cur[p];}return cur;},
    set:function(path,value){var parts=String(path).split('.'),cur=state;for(var i=0;i<parts.length-1;i++)cur=cur[parts[i]]||(cur[parts[i]]={});cur[parts[parts.length-1]]=value;emit('change:'+path,value);emit('change',{path:path,value:value});return value;},
    patch:function(path,values){var current=this.get(path,{});var next=Object.assign({},current,values||{});return this.set(path,next);},
    on:function(topic,fn){(listeners[topic]||(listeners[topic]=[])).push(fn);return function(){api.off(topic,fn);};},
    off:function(topic,fn){var list=listeners[topic]||[];var i=list.indexOf(fn);if(i>=0)list.splice(i,1);},
    emit:emit,
    registerModule:function(name,moduleApi){if(modules[name])throw new Error('Module already registered: '+name);modules[name]=moduleApi||{};emit('module:registered',{name:name,module:moduleApi});return moduleApi;},
    module:function(name){return modules[name]||null;},
    moduleNames:function(){return Object.keys(modules);},
    snapshot:function(){return JSON.parse(JSON.stringify(state));}
  };
  root.TotaState=api;
})(typeof window!=='undefined'?window:globalThis);
