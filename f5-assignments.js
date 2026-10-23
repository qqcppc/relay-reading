/* F5: assignment plan. No permission changes while this experiment is OFF. */
(function(root){
  'use strict';
  let context=null, assignments={}, assignmentRevision='0', saving=false, manual=false;
  const enabled=()=>!!root.RelayFeatures?.enabled('F5');
  const $=id=>document.getElementById(id);
  const signature=()=>JSON.stringify(context.text());
  function roster(){return [...new Set($('f5-names').value.split(/[,，\n]+/).map(s=>s.trim()).filter(Boolean))];}
  function validRoster(names){if(!names.length || names.length>100 || names.some(name=>name.length>80)) throw Error('이름 1~80자 필요');}
  function paint(){
    if(!enabled() || !context)return;
    const grid=$('f5-grid');grid.replaceChildren();grid.hidden=!manual;if(!manual)return;
    const {from,to}=context.range();
    for(let index=from;index<to;index++){
      const button=document.createElement('button');button.type='button';button.textContent=String(context.number(index));
      const name=assignments[index+1];button.setAttribute('aria-label',`${context.label(index)} ${name || '미배정'}`);
      if(name)button.style.setProperty('--assignment-color',context.color(name));
      button.onclick=()=>choose(index+1);grid.append(button);
    }
  }
  async function save(next){
    if(saving || context.locked())return;
    saving=true;
    try{
      if(root.RelayStorage.connected){
        const data=await root.RelayStorage.request('saveAssignments',{revision:context.revision(),assignmentRevision,assignments:next});
        assignments=data.assignments;assignmentRevision=data.assignmentRevision;
      }else{
        localStorage.setItem('relay.assignments.v1',JSON.stringify({signature:signature(),assignments:next}));assignments=next;
      }
      $('f5-status').textContent='';context.render();paint();
    }catch(error){$('f5-status').textContent=error.code==='CONFLICT'?'배정표 변경됨. 새로고침 필요':error.message;}
    finally{saving=false;}
  }
  async function refresh(){
    if(!enabled() || !context)return;
    if(root.RelayStorage.connected){
      if(context.revision()===null)return;
      const data=await root.RelayStorage.request('getAssignments');
      if(data.revision!==context.revision())throw Error('본문 새로고침 필요');
      assignments=data.assignments;assignmentRevision=data.assignmentRevision;
    }else{
      assignments={};
      try{const saved=JSON.parse(localStorage.getItem('relay.assignments.v1')||'null');if(saved?.signature===signature())assignments=saved.assignments || {};}catch(_){}
    }
    if(!$('f5-names').value)$('f5-names').value=[...new Set(Object.values(assignments).length?Object.values(assignments):context.names())].join(', ');
    context.render();paint();
  }
  function choose(verse){
    if(!enabled() || saving || context.locked())return;
    let names=roster();try{validRoster(names);}catch(error){$('f5-status').textContent=error.message;return;}
    const list=$('f5-people');list.replaceChildren();
    $('f5-person-title').textContent=context.label(verse-1);
    for(const name of ['',...names]){
      const button=document.createElement('button');button.type='button';button.textContent=name || '미배정';
      button.onclick=async()=>{if(saving)return;const next={...assignments};if(name)next[verse]=name;else delete next[verse];await save(next);$('f5-person').close();};list.append(button);
    }
    $('f5-person').showModal();
  }
  root.RelayF5={enabled,owner:verse=>enabled()?assignments[verse] || '':'',refresh,paint,
    choose:verse=>{if(manual)choose(verse);},
    manual:()=>enabled() && manual,
    reset:()=>{assignments={};assignmentRevision='0';if(!root.RelayStorage.connected){try{localStorage.removeItem('relay.assignments.v1');}catch(_){}}paint();},
    init(ctx){
      context=ctx;$('f5-controls').hidden=!enabled();if(!enabled())return;
      $('f5-manual').onchange=()=>{manual=$('f5-manual').checked;paint();};
      for(const size of [1,2])$('f5-round-'+size).onclick=()=>{
        try{const names=roster();validRoster(names);manual=false;$('f5-manual').checked=false;const next={};for(let i=0;i<context.text().verses.length;i++)next[i+1]=names[Math.floor(i/size)%names.length];save(next);}catch(error){$('f5-status').textContent=error.message;}
      };
      $('f5-refresh').onclick=()=>refresh().catch(error=>{$('f5-status').textContent=error.message;});
      refresh().catch(error=>{$('f5-status').textContent=error.message;});
    }
  };
})(globalThis);
