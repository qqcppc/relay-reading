/* F13 generates copyable text locally; it never sends a chat message. */
(function(root){
  'use strict';let context=null,previous=new Map();
  const enabled=()=>!!root.RelayFeatures?.enabled('F13');const $=id=>document.getElementById(id);
  function messages(state){const result=[];if(state.chapterComplete)result.push(`${state.book} ${state.chapter} 낭독이 완성됐어. 함께 읽어 줘서 고마워!`);if(state.name&&state.goal>0&&state.mine>=state.goal)result.push(`${state.name}의 낭독 목표 100%를 채웠어. 함께 이어 읽자!`);return result;}
  function paint(){if(!context||!enabled())return;const state=context.state(),text=messages(state).join('\n');$('f13-controls').hidden=!text;$('f13-text').value=text;$('f13-copy').disabled=!text;
    const key=JSON.stringify([state.revision,state.book,state.chapter,state.name,state.goal]),active=!!text;
    if(previous.has(key)&&!previous.get(key)&&active)context.notify('진행 문구 준비 · 온기목장에서 복사');previous.set(key,active);
  }
  root.RelayF13={enabled,messages,paint,init(next){context=next;if(!enabled())return;$('f13-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('f13-text').value);$('f13-status').textContent='복사됨 · 카톡에 붙여넣기';}catch(_){$('f13-text').focus();$('f13-text').select();$('f13-status').textContent='문구를 길게 눌러 복사';}};paint();}};
})(globalThis);
