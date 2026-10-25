/* F3: installability and explicit invitation sharing. Inert while OFF. */
(function(root) {
  'use strict';
  const enabled=()=>!!root.RelayFeatures?.enabled('F3');
  const base=new URL('./',location.href), prefix='relay-reading:'+base.pathname+':';
  let installPrompt=null;
  async function disable() {
    if('serviceWorker' in navigator) {
      const registrations=await navigator.serviceWorker.getRegistrations();
      for(const registration of registrations) {
        const script=registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
        if(script && new URL(script).pathname===new URL('sw.js',base).pathname) await registration.unregister();
      }
    }
    if('caches' in root) for(const key of await caches.keys()) if(key.startsWith(prefix)) await caches.delete(key);
    document.querySelector('link[data-f3-manifest]')?.remove();
  }
  root.RelayPWA={disable};
  window.addEventListener('beforeinstallprompt',event=>{if(enabled()){event.preventDefault();installPrompt=event;}});
  document.addEventListener('DOMContentLoaded',async()=>{
    const $=id=>document.getElementById(id);
    if(!enabled()) {try{await disable();}catch(_){}return;}
    $('f3-actions').hidden=false;$('f3-invite').hidden=false;
    const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='manifest.webmanifest?v=61';manifest.dataset.f3Manifest='true';document.head.append(manifest);
    const icon=document.createElement('link');icon.rel='apple-touch-icon';icon.href='icons/icon-192.png';document.head.append(icon);
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=61',{scope:'./',updateViaCache:'none'}).catch(()=>{$('f3-install-status').textContent='앱 준비 실패. 새로고침 후 재시도';});
    }
    $('f3-install').onclick=async()=>{
      if(installPrompt) {const prompt=installPrompt;installPrompt=null;try {await prompt.prompt();await prompt.userChoice;}catch(_) {$('f3-install-status').textContent='브라우저 메뉴 → 홈 화면에 추가';}}
      else $('f3-install-status').textContent=/iPhone|iPad/.test(navigator.userAgent)?'Safari 공유 → 홈 화면에 추가':'브라우저 메뉴 → 홈 화면에 추가';
    };
    $('f3-invite').onclick=async()=>{
      const url=root.RelayStorage.invitation(new URL('index.html',base).href);
      $('f3-copy').hidden=true;$('f3-share-status').textContent='';
      if(navigator.share) {
        try {await navigator.share({title:'릴레이 낭독',url});return;}
        catch(error) {if(error.name==='AbortError')return;}
      }
      try {await navigator.clipboard.writeText(url);$('f3-share-status').textContent='초대 링크 복사됨';}
      catch(_) {$('f3-copy').value=url;$('f3-copy').hidden=false;$('f3-copy').select();$('f3-share-status').textContent='선택된 링크 복사';}
    };
  });
})(globalThis);
