/* ADMIN_KEY is verified by the server and scoped to this connection, never an invitation. */
(function(root){
  'use strict';const $=id=>document.getElementById(id),KEY='relay.admin.v1';let context=null,key=null,allowed=false,scope=null,ready=false;
  function paint(){if(!context)return;for(const node of document.querySelectorAll('[data-edit]'))node.hidden=!allowed;
    $('f1-text').hidden=!allowed||!root.RelayStorage.connected;$('f8-open').hidden=!allowed||!root.RelayF8?.enabled();$('f9-controls').hidden=!allowed||!root.RelayF9?.enabled();if(!allowed)$('editor').hidden=true;
    $('admin-forget').hidden=!allowed;$('admin-checks').hidden=!allowed;
  }
  function revoke(){allowed=false;key=null;$('checks-list').replaceChildren();$('checks-status').textContent='';try{localStorage.removeItem(KEY);}catch(_){}paint();context?.changed();}
  async function verify(value,remember){
    if(!root.RelayStorage.connectionUrl)throw Error('공유 연결을 먼저 설정');
    const expected=await root.RelayStorage.queueScope(),result=await root.RelayStorage.request('getAccess',{adminKey:value});
    if(!result.admin){allowed=false;paint();throw Error(result.configured?'관리자 키 확인 필요':'저장 서버에 ADMIN_KEY 설정 필요');}
    if(remember)localStorage.setItem(KEY,JSON.stringify({scope:expected,key:value}));scope=expected;key=value;allowed=true;paint();context.changed();return true;
  }
  root.RelayAccess={allowed:()=>allowed,ready:()=>ready,paint,revoke,
    fields(){if(!allowed||!key)throw Object.assign(Error('관리자 키 확인 필요'),{code:'ADMIN_REQUIRED'});return {adminKey:key};},
    init(next){context=next;paint();$('admin-verify').onclick=async()=>{if(context.locked())return;$('admin-verify').disabled=true;try{await verify($('admin-key').value,true);$('admin-key').value='';$('admin-status').textContent='확인됨';}catch(error){$('admin-status').textContent=error.message;}finally{$('admin-verify').disabled=false;}};
      $('admin-forget').onclick=()=>{if(context.locked())return;revoke();$('admin-key').value='';$('admin-status').textContent='관리자 키 해제';};
      (async()=>{try{if(root.RelayStorage.connectionUrl){scope=await root.RelayStorage.queueScope();const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.scope===scope&&typeof saved.key==='string')await verify(saved.key,false);}}catch(_){allowed=false;key=null;}finally{ready=true;paint();context.changed();}})();
    }
  };
})(globalThis);
