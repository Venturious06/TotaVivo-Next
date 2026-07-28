const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const context={console,Date,setTimeout,clearTimeout};context.globalThis=context;vm.createContext(context);
for(const rel of ['apps/totavivo/assets/core/storage.js','apps/totavivo/assets/core/state.js','apps/totavivo/assets/modules/medications.js','apps/totavivo/assets/modules/safety.js']){
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),context,{filename:rel});
}
function check(ok,msg){if(!ok)throw new Error(msg);console.log('✓',msg);}
check(context.TotaStorage.persistent.isFallback,'storage falls back safely when browser storage is unavailable');
context.TotaStorage.setJSON('totavivo_test',{ok:true});
check(context.TotaStorage.getJSON('totavivo_test',{}).ok===true,'JSON storage round-trip works');
const backup=context.TotaStorage.backup();
check(backup.persistent.totavivo_test,'backup includes TotaVivo keys');
context.TotaState.set('profile.name','Randy');
check(context.TotaState.get('profile.name')==='Randy','shared nested state works');
check(context.TotaState.moduleNames().includes('medications')&&context.TotaState.moduleNames().includes('safety'),'domain modules register');
context.TotaMedications.save([{id:'m1',name:'Test'}]);
check(context.TotaMedications.list().length===1,'medication module persists items');
check(context.TotaSafety.setSensitivity(99)===6,'safety sensitivity is bounded');
context.TotaSafety.setMotionGranted(true);
check(context.TotaSafety.snapshot().motionGranted===true,'safety motion preference persists');
console.log('\nTotaVivo 8.2 core module tests passed.');
