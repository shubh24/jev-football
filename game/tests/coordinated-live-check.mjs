import {readFile,writeFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile('tests/fixtures/coherence-baseline.json','utf8')),report=[];
for(const row of baseline.scenarios){
 const state=row.state,started=performance.now(),res=await fetch('http://127.0.0.1:4318/api/team-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}),data=await res.json();
 const item={scenario:row.scenario,status:res.status,elapsedMs:Math.round(performance.now()-started),oldElapsedMs:row.elapsedMs,decisions:data.decisions,stages:data.stages,error:data.error};report.push(item);
 console.log(JSON.stringify({...item,decisions:Object.fromEntries(Object.entries(data.decisions||{}).map(([id,d])=>[id,{action:d.action,command:d.command.label}]))}));
 if(!res.ok)break;
}
await writeFile('artifacts/coordinated-live-check.json',JSON.stringify(report,null,2));
