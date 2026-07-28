/* Safety domain boundary — owns persisted fall/motion preferences and exposes one status snapshot. */
(function(root){
  'use strict';
  var keys={motion:'totavivo_motion_granted',sensitivity:'totavivo_fall_sens_v2',pause:'totavivo_fall_pause_v1'};
  var api={
    name:'safety',keys:keys,
    getPreferences:function(){return {motionGranted:root.TotaStorage.getItem(keys.motion)==='1',sensitivity:Number(root.TotaStorage.getItem(keys.sensitivity)||3),pausedOn:root.TotaStorage.getItem(keys.pause)};},
    setSensitivity:function(level){level=Math.max(1,Math.min(6,Number(level)||3));root.TotaStorage.setItem(keys.sensitivity,String(level));root.TotaState.set('safety.sensitivity',level);root.TotaState.emit('safety:preference',{key:'sensitivity',value:level});return level;},
    setMotionGranted:function(granted){granted?root.TotaStorage.setItem(keys.motion,'1'):root.TotaStorage.removeItem(keys.motion);root.TotaState.set('safety.motionGranted',!!granted);return !!granted;},
    pauseForDate:function(dateKey){root.TotaStorage.setItem(keys.pause,dateKey);root.TotaState.set('safety.pausedOn',dateKey);},
    resume:function(){root.TotaStorage.removeItem(keys.pause);root.TotaState.set('safety.pausedOn',null);},
    snapshot:function(){return this.getPreferences();},
    init:function(){var p=this.getPreferences();root.TotaState.set('safety',p);}
  };
  root.TotaSafety=root.TotaState.registerModule('safety',api);api.init();
})(typeof window!=='undefined'?window:globalThis);
