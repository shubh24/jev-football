export const ACTION_LABELS={
  wait:'Wait',center:'Block in place',
  step_left_25:'Step left · 0.25 m',step_right_25:'Step right · 0.25 m',
  step_left_50:'Step left · 0.50 m',step_right_50:'Step right · 0.50 m',
  left_low:'Dive left · low',right_low:'Dive right · low',
  left_high:'Dive left · high',right_high:'Dive right · high',
};
const $=id=>document.getElementById(id);
let selected=null,lastHistory=[],lastContext={};
const sourceLabel=source=>source==='jev'?'JEV':source==='practice'?'Practice':'Test';
export function initDecisionPanel(){
  const grid=$('action-probabilities');
  for(const [action,label]of Object.entries(ACTION_LABELS)){
    const row=document.createElement('div');row.className='action-probability';row.dataset.action=action;row.setAttribute('role','group');
    const name=document.createElement('span');name.textContent=label;
    const value=document.createElement('b');value.textContent='—';
    const track=document.createElement('i'),fill=document.createElement('u');track.append(fill);row.append(name,value,track);grid.append(row);
  }
  $('decision-latest').addEventListener('click',()=>{selected=null;renderDecisionPanel(lastHistory,lastContext);});
  $('decision-details').open=window.matchMedia('(min-width: 701px)').matches;
  resetDecisionPanel();
}
export function resetDecisionPanel(){selected=null;renderDecisionPanel([],{});}
export function renderDecisionPanel(history,{phase='ready',committed=false}={}){
  lastHistory=history;lastContext={phase,committed};
  const index=selected===null?history.length-1:selected,entry=history[index];
  $('decision-count').textContent=String(history.length).padStart(2,'0');
  $('decision-snapshot').textContent=entry?`${sourceLabel(entry.source)} · Decision ${index+1}${selected===null?' · Latest':''}`:'Waiting for a decision';
  $('decision-latest').hidden=selected===null;
  for(const row of $('action-probabilities').children){
    const p=entry?.probabilities?.[row.dataset.action];
    row.querySelector('b').textContent=typeof p==='number'?`${(p*100).toFixed(1)}%`:'—';
    row.querySelector('u').style.width=typeof p==='number'?`${p*100}%`:'0%';
    row.classList.toggle('chosen',entry?.action===row.dataset.action);
    row.setAttribute('aria-label',`${ACTION_LABELS[row.dataset.action]}: ${typeof p==='number'?`${(p*100).toFixed(1)} percent`:'No response'}${entry?.action===row.dataset.action?'. Selected action.':''}`);
  }
  $('decision-note').textContent=phase==='replay'?'Recorded decisions. Select an entry to inspect it.':phase==='result'?'Shot complete. Select a decision to inspect it.':committed?'Dive started. No further decisions for this shot.':'Decisions appear as responses arrive.';
  const list=$('decision-history'),scroll=list.scrollTop;list.replaceChildren();
  $('decision-empty').hidden=history.length>0;
  history.forEach((item,i)=>{
    const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='decision-entry';button.dataset.status=item.applied?'applied':item.action?'ignored':'error';button.setAttribute('aria-pressed',String(i===index));
    const title=document.createElement('strong');title.textContent=`${String(i+1).padStart(2,'0')}  ${ACTION_LABELS[item.action]||'No response'}`;
    const badge=document.createElement('span');badge.className='decision-badge';badge.textContent=item.applied?'Used':item.action?'Not used':'Failed';
    const meta=document.createElement('small');meta.textContent=`${item.phase==='runup'?'Run-up':'Flight'} +${item.time.toFixed(2)} s · ${sourceLabel(item.source)} · ${item.latencyMs??item.roundTripMs} ms`;
    button.append(title,badge,meta);
    if(item.reason){const reason=document.createElement('small');reason.className='decision-reason';reason.textContent=item.reason;button.append(reason);}
    button.addEventListener('click',()=>{selected=i;renderDecisionPanel(lastHistory,lastContext);$('decision-history').children[i]?.querySelector('button').focus({preventScroll:true});});
    li.append(button);list.append(li);
  });
  list.scrollTop=selected===null?list.scrollHeight:scroll;
}
