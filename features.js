/* F1/F2/F3 are opt-in experiments. Default OFF, independent of appearance settings. */
(function(root) {
  'use strict';
  const key='relay.features.v1', flags={F1:false,F2:false,F3:false,F4:false,F5:false,F7:false,F8:false,F9:false,F10:false,F11:false,F12:false,F13:false,F14:false,F15:false,F16:false};
  try {const saved=JSON.parse(localStorage.getItem(key)||'null'); for(const name of Object.keys(flags)) flags[name]=saved?.[name]===true;} catch (_) {}
  let live=false,admin=false;try{live=JSON.parse(localStorage.getItem('relay.live.v1')||'null')?.connection===localStorage.getItem('relay.connection.v1');admin=sessionStorage.getItem('relay.adminMode')==='1'||(localStorage.getItem('relay.owner.v1')&&localStorage.getItem('relay.ownerMode.v1')!=='0');}catch(_){}
  if(live)try{const connection=JSON.parse(localStorage.getItem('relay.connection.v1')||'null');admin=localStorage.getItem('relay.owner.v1')===connection?.url&&localStorage.getItem('relay.ownerMode.v1')!=='0';}catch(_){admin=false;}
  if(live)flags.F1=true;admin=true;root.RelayFeatures={adminRuntime:()=>true,enabled:name=>flags[name]===true,
    activateLive(owner=false){localStorage.setItem('relay.live.v1',JSON.stringify({connection:localStorage.getItem('relay.connection.v1')}));if(owner){const next={...flags};for(const name of Object.keys(next))if(name!=='F11')next[name]=true;localStorage.setItem(key,JSON.stringify(next));}},
    // Valid invitations connect participants without exposing creator switches.
    enableConnection(){localStorage.setItem(key,JSON.stringify({...flags,F1:true}));flags.F1=true;},
    // The empty shared-text action explicitly enables the existing importer without a reload.
    enableImport(){
      if(flags.F8)return;
      if(typeof root.locked==='function'&&root.locked())throw Error('녹음 확인을 먼저 마쳐야 함');
      try{localStorage.setItem(key,JSON.stringify({...flags,F8:true}));}catch(_){throw Error('본문 넣기를 켤 수 없음 · 브라우저 저장 설정 확인');}
      flags.F8=true;const toggle=document.getElementById('feature-f8');if(toggle)toggle.checked=true;
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const $=id=>document.getElementById(id);
    for(const name of Object.keys(flags)) {
      const toggle=$('feature-'+name.toLowerCase()); toggle.checked=flags[name];
      toggle.onchange=async()=>{
        if(typeof root.locked==='function' && root.locked()) {toggle.checked=flags[name];$('feature-status').textContent='녹음 확인을 먼저 마쳐야 함';return;}
        const next={...flags,[name]:toggle.checked};
        try {localStorage.setItem(key,JSON.stringify(next));}
        catch (_) {toggle.checked=flags[name];$('feature-status').textContent='브라우저 저장 설정 확인 필요';return;}
        if(name==='F3' && !next.F3) {try {await root.RelayPWA?.disable();} catch (_) { /* OFF is still persisted; retry cleanup after reload. */ }}
        try {sessionStorage.setItem('relay.reopen',JSON.stringify({id:'settings',top:$('settings').scrollTop||0}));} catch (_) {}
        location.reload();
      };
    }
    // F1: fields are entirely hidden while OFF; switching OFF keeps credentials for later.
    $('f1-connection').hidden=!flags.F1;
    $('f1-url').value=root.RelayStorage.connectionUrl;
    $('f1-status').textContent=root.RelayStorage.connected?'연결됨':'';
    $('f1-connect').onclick=async()=>{
      if(typeof root.locked==='function' && root.locked()) return;
      $('f1-connect').disabled=true;
      try {await root.RelayStorage.connect($('f1-url').value.trim(),$('f1-key').value);location.reload();}
      catch (_) {$('f1-status').textContent='연결 실패. 주소·공유키·배포 권한 확인';}
      finally {$('f1-connect').disabled=false;}
    };
    $('f1-text').hidden=!root.RelayStorage.connected||!root.RelayAccess?.allowed();
    $('f1-text').onclick=()=>{if(!root.RelayAccess?.allowed())return;if(typeof root.locked==='function' && root.locked()) return;$('settings').close();$('editor').hidden=false;$('editor').open=true;$('editor').scrollIntoView({block:'start'});};
    $('f1-disconnect').onclick=()=>{
      if(typeof root.locked==='function' && root.locked()) return;
      try {root.RelayStorage.disconnect();location.reload();}
      catch (_) {$('f1-status').textContent='연결 정보 삭제 실패';}
    };
  });
})(globalThis);
