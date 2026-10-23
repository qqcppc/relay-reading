/* F2: advisory name ownership + server-enforced, expiring per-verse lease. */
(function(root) {
  'use strict';
  let locks=[], lease=null, serverEnabled=false, renewal=null, pendingRelease=Promise.resolve();
  let onChange=()=>{}, onLost=()=>{};
  const active=()=>!!root.RelayFeatures?.enabled('F2');
  const shared=()=>active() && root.RelayStorage.connected;
  const live=()=>lease && lease.expiresAt>Date.now();
  async function refresh() {
    if(!shared()) return;
    const data=await root.RelayStorage.request('listLocks');
    if(data.revision!==root.RelayF2.revision()) throw new Error('본문을 새로고침해야 함');
    serverEnabled=data.enabled===true; locks=data.locks || []; onChange();
  }
  async function release() {
    clearInterval(renewal);renewal=null;
    const old=lease;lease=null;
    if(!old) return;
    locks=locks.filter(item=>item.verse!==old.verse);
    pendingRelease=root.RelayStorage.request('releaseLock',{revision:old.revision,verse:old.verse,leaseToken:old.leaseToken}).catch(()=>{});
    await pendingRelease;
  }
  root.RelayF2={
    revision:()=>null,
    active,
    blocked(verse) {return shared() && locks.some(item=>item.verse===verse && item.expiresAt>Date.now() && !(live() && lease.verse===verse));},
    ownerBlocked(item,name) {return active() && item && !item.demo && item.readerName!==name.trim();},
    async acquire(target) {
      if(!shared()) return;
      await pendingRelease;
      await refresh();
      if(!serverEnabled) throw new Error('배포 설정에 F2_ENABLED=true 필요');
      const data=await root.RelayStorage.request('acquireLock',target);
      lease={...data,revision:target.revision,readerName:target.readerName};
      renewal=setInterval(async()=>{
        const current=lease;if(!current) return;
        try {
          const renewed=await root.RelayStorage.request('renewLock',{...target,leaseToken:current.leaseToken});
          if(lease===current) lease={...current,expiresAt:renewed.expiresAt};
        } catch (_) {if(lease===current) {clearInterval(renewal);lease.expiresAt=0;onLost();}}
      },30000);
    },
    uploadFields() {
      if(!shared()) return {};
      if(!live()) throw new Error('잠금 만료. 취소 후 다시 녹음');
      return {leaseToken:lease.leaseToken};
    },
    release,
    init(revision,onUpdate,onLeaseLost) {
      root.RelayF2.revision=revision;onChange=onUpdate;onLost=onLeaseLost;
      if(shared()) {
        refresh().catch(()=>{});
        setInterval(()=>refresh().catch(()=>{}),10000);
      }
    }
  };
})(globalThis);
