const {spawnSync}=require('node:child_process');
for(const file of ['features-smoke.cjs','settings-smoke.cjs','f4-f8-smoke.cjs','f9-smoke.cjs','long-1-smoke.cjs','bg-seed-smoke.cjs','drafts-smoke.cjs','screen-smoke.cjs']){
 const result=spawnSync(process.execPath,['tests/'+file],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
