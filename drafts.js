/* Unsaved text stays on this device. It is never treated as a successful Drive save. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const forms={
    import:{ids:['f8-title','f8-source'],status:'f8-draft-status',button:'f8-draft-discard'},
    editor:{ids:['text-input'],status:'editor-draft-status',button:'editor-draft-discard'}
  };
  let context=null,prefix=null,initializing=false,pendingReveal=null;
  for(const form of Object.values(forms))Object.assign(form,{baseline:null,dirty:false,persisted:false,restored:false});
  const fields=form=>form.ids.map(id=>$(id).value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function paint(kind,message){const form=forms[kind];$(form.status).textContent=message||(!form.dirty?'':form.persisted?(form.restored?'이 폰의 임시 입력 복원 · Drive 저장 전':'이 폰에 임시 보관 · Drive 저장 전'):'임시 보관 실패 · 새로고침 전에 본문 복사');$(form.button).hidden=!form.dirty;}
  function persist(kind){const form=forms[kind];if(!form.dirty)return;
    form.persisted=false;
    if(prefix)try{localStorage.setItem(prefix+kind,JSON.stringify({fields:fields(form),revision:context.revision(),updatedAt:Date.now()}));form.persisted=true;}catch(_){}
    paint(kind);
  }
  function capture(kind){const form=forms[kind];form.restored=false;form.dirty=!same(fields(form),form.baseline);
    if(form.dirty)persist(kind);else{form.persisted=false;if(prefix)try{localStorage.removeItem(prefix+kind);}catch(_){}paint(kind);}
  }
  function reveal(){if(!pendingReveal||!context?.ready()||context.locked())return;
    if(pendingReveal==='import'){if(!root.RelayF8?.enabled())return;root.RelayF8.open();}
    else{$('editor').hidden=false;$('editor').open=true;}
    pendingReveal=null;
  }
  function serverText(value){const form=forms.editor;form.baseline=[value];if(!form.dirty)$('text-input').value=value;}
  function saved(kind,submitted){const form=forms[kind];
    // Typing during an asynchronous save belongs to the next draft.
    if(submitted&&!same(fields(form),submitted)){capture(kind);return;}
    form.dirty=false;form.persisted=false;form.restored=false;
    if(kind==='editor'&&form.baseline)$('text-input').value=form.baseline[0];
    form.baseline=fields(form);if(pendingReveal===kind)pendingReveal=null;
    try{if(prefix)localStorage.removeItem(prefix+kind);paint(kind);}catch(_){paint(kind,'Drive 저장 완료 · 폰 임시 입력 삭제 실패');}
  }
  function discard(kind){const form=forms[kind];if(context.locked()||!root.confirm('이 폰의 임시 입력을 지울까? 서버 본문은 유지돼.'))return;
    try{if(prefix)localStorage.removeItem(prefix+kind);}catch(_){paint(kind,'폰 임시 입력 삭제 실패');return;}
    if(kind==='import'){$('f8-title').value='본문';$('f8-source').value='';}else $('text-input').value=form.baseline?.[0]||'';
    form.baseline=fields(form);form.dirty=false;form.persisted=false;form.restored=false;if(pendingReveal===kind)pendingReveal=null;
    for(const id of form.ids)$(id).dispatchEvent(new Event('input',{bubbles:true}));paint(kind);
  }
  async function init(next){if(initializing)return;initializing=true;context=next;
    for(const [kind,form]of Object.entries(forms)){
      form.baseline=fields(form);for(const id of form.ids)$(id).addEventListener('input',()=>capture(kind));
      $(form.button).onclick=()=>discard(kind);
    }
    const flush=()=>{for(const kind of Object.keys(forms))if(forms[kind].dirty)persist(kind);};
    root.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
    root.addEventListener('beforeunload',event=>{flush();if(Object.values(forms).some(form=>form.dirty&&!form.persisted)){event.preventDefault();event.returnValue='';}});
    try{
      const scope=root.RelayStorage.connected?'shared:'+await root.RelayStorage.queueScope():'trial';
      prefix='relay.draft.v1:'+new URL('./',location.href).pathname+':'+scope+':';
      let latest=0;
      for(const [kind,form]of Object.entries(forms)){
        if(form.dirty){persist(kind);continue;}
        let entry;try{entry=JSON.parse(localStorage.getItem(prefix+kind)||'null');}catch(_){}
        if(!entry||!Array.isArray(entry.fields)||entry.fields.length!==form.ids.length||entry.fields.some(value=>typeof value!=='string')||typeof entry.updatedAt!=='number')continue;
        form.ids.forEach((id,index)=>{$(id).value=entry.fields[index];});form.dirty=true;form.persisted=true;form.restored=true;
        // Consent/preview always starts again after restoration, including a newer server revision.
        if(kind==='import'){$('f8-save').disabled=true;$('f8-consent').checked=false;$('f8-preview').replaceChildren();}
        else $('erase-confirm').checked=false;
        paint(kind);if(entry.updatedAt>=latest){latest=entry.updatedAt;pendingReveal=kind;}
      }
      reveal();
    }catch(_){for(const kind of Object.keys(forms))if(forms[kind].dirty)paint(kind);}
  }
  root.RelayDrafts={init,capture,saved,serverText,reveal};
})(globalThis);
