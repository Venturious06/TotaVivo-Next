/* Medication domain boundary — centralizes medication state without changing validated UI behavior. */
(function(root){
  'use strict';
  var KEY='totavivo_medications_v1';
  var api={
    name:'medications',storageKey:KEY,
    list:function(){return root.TotaStorage.getJSON(KEY,[]);},
    save:function(items){if(!Array.isArray(items))throw new TypeError('Medication list must be an array');root.TotaStorage.setJSON(KEY,items);root.TotaState.set('medications.items',items);root.TotaState.emit('medications:saved',items);return items;},
    add:function(item){var items=this.list();items.push(Object.assign({id:'med-'+Date.now(),createdAt:new Date().toISOString()},item||{}));return this.save(items);},
    remove:function(id){return this.save(this.list().filter(function(item){return item.id!==id;}));},
    snapshot:function(){return {items:this.list()};},
    init:function(){root.TotaState.set('medications.items',this.list());}
  };
  root.TotaMedications=root.TotaState.registerModule('medications',api);api.init();
})(typeof window!=='undefined'?window:globalThis);
