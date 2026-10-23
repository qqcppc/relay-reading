/* F1/F2/F3 are opt-in experiments. Default OFF, independent of appearance settings. */
(function(root) {
  'use strict';
  const key='relay.features.v1', flags={F1:false,F2:false,F3:false,F4:false,F5:false,F7:false};
  try {const saved=JSON.parse(localStorage.getItem(key)||'null'); for(const name of Object.keys(flags)) flags[name]=saved?.[name]===true;} catch (_) {}
  root.RelayFeatures={enabled:name=>flags[name]===true};
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
    $('f1-text').hidden=!root.RelayStorage.connected;
    $('f1-text').onclick=()=>{if(typeof root.locked==='function' && root.locked()) return;$('settings').close();$('editor').hidden=false;$('editor').open=true;$('editor').scrollIntoView({block:'start'});};
    $('f1-disconnect').onclick=()=>{
      if(typeof root.locked==='function' && root.locked()) return;
      try {root.RelayStorage.disconnect();location.reload();}
      catch (_) {$('f1-status').textContent='연결 정보 삭제 실패';}
    };
  });
})(globalThis);
