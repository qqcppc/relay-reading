/* F11: private on-device outbox, scoped to deployment+key; never a successful save. */
(function(root){
  'use strict';
  let dbPromise,scope=null,items=[],context=null,running=false;
  const enabled=()=>!!root.RelayFeatures?.enabled('F11')&&root.RelayStorage.connected;
  const owner=root.crypto?.randomUUID?.()||String(Math.random());
  function db(){if(!root.indexedDB)return Promise.reject(Error('폰 대기열 저장 불가'));return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('relay.outbox.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('takes',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('폰 대기열 저장 불가'));r.onblocked=()=>reject(Error('다른 탭을 닫고 다시 시도'));});}
  async function transaction(write,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('takes',write?'readwrite':'readonly'),store=tx.objectStore('takes');let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('폰 대기열 저장 실패 · 임시 녹음 유지'));fn(store,value=>{result=value;},tx);});}
  const all=()=>transaction(false,(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result);});
  async function reload(){items=(await all()).filter(item=>item.scope===scope);paint();context?.render();}
  function paint(){const box=document.getElementById('f11-controls');if(!box)return;box.hidden=!enabled();const list=document.getElementById('f11-list');list.replaceChildren();document.getElementById('f11-status').textContent=items.length?`이 폰 업로드 대기 ${items.length}개`:'대기 없음';
    for(const item of items){const li=document.createElement('li'),label=document.createElement('span');label.textContent=`${item.verse}${item.endVerse>item.verse?'–'+item.endVerse:''}절 · ${item.readerName} · ${item.message||'연결되면 재전송'}`;const del=document.createElement('button');del.type='button';del.textContent='삭제';del.disabled=running;del.onclick=async()=>{if(!root.confirm('이 폰에 보관한 대기 녹음을 삭제할까?'))return;try{await transaction(true,(s,done,tx)=>{s.get(item.id).onsuccess=e=>{if(e.target.result?.claimUntil>Date.now()){tx.abort();return;}s.delete(item.id);};});await reload();}catch(error){context.report(error.message);}};li.append(label,del);list.append(li);}
  }
  async function enqueue(take){if(!enabled())throw Error('대기열 꺼짐');if(!scope)scope=await root.RelayStorage.queueScope();
    await transaction(true,(s,done,tx)=>{s.getAll().onsuccess=e=>{const rows=e.target.result;if(rows.some(r=>r.scope===scope&&r.revision===take.revision&&r.verse===take.verse)||rows.length>=20||rows.reduce((sum,r)=>sum+r.blob.size,0)+take.blob.size>50*1024*1024){tx.abort();return;}s.add({id:take.uploadId,scope,verse:take.verse,endVerse:take.endVerse,revision:take.revision,readerName:take.readerName,blob:take.blob,expectedPrevious:take.expectedPrevious,createdAt:Date.now(),blocked:false});};});
    await reload();
  }
  async function claim(id){return transaction(true,(s,done)=>{s.get(id).onsuccess=e=>{const item=e.target.result;if(!item||item.blocked||item.claimUntil>Date.now())return done(null);item.claimOwner=owner;item.claimUntil=Date.now()+180000;s.put(item);done(item);};});}
  async function finish(item,error){await transaction(true,s=>{s.get(item.id).onsuccess=e=>{const stored=e.target.result;if(stored?.claimOwner!==owner)return;if(!error)s.delete(item.id);else{s.put({...stored,claimUntil:0,claimOwner:null,blocked:!!error.code && !['BUSY','INTERNAL_ERROR','LOCKED'].includes(error.code),message:error.message});}};});}
  async function send(item){
    const list=await root.RelayStorage.request('listRecordings');if(list.revision!==item.revision)throw Object.assign(Error('본문 변경 · 보관본 삭제 후 새로 녹음'),{code:'CONFLICT'});
    const current=list.recordings.find(r=>r.verse===item.verse);
    if(current?.uploadId===item.id)return; // Previous response was lost, but the server persisted it.
    if((current?.playbackUrl||null)!==item.expectedPrevious)throw Object.assign(Error('다른 녹음으로 변경됨 · 자동 교체 중단'),{code:'CONFLICT'});
    let lease;
    try{
      const locks=await root.RelayStorage.request('listLocks');
      if(locks.enabled){lease=await root.RelayStorage.request('acquireLock',{revision:item.revision,verse:item.verse,readerName:item.readerName});}
      await root.RelayStorage.request('uploadRecording',{revision:item.revision,verse:item.verse,endVerse:item.endVerse,readerName:item.readerName,mimeType:item.blob.type,audioBase64:await context.base64(item.blob),uploadId:item.id,expectedPrevious:item.expectedPrevious,...(lease?{leaseToken:lease.leaseToken}:{})});
    }finally{if(lease)await root.RelayStorage.request('releaseLock',{revision:item.revision,verse:item.verse,leaseToken:lease.leaseToken}).catch(()=>{});}
  }
  async function flush(){
    if(!enabled()||!context||running||!scope||!navigator.onLine||context.locked()||!context.ready())return;
    running=true;context.busy(true);paint();
    try{
      await reload();for(const row of items){if(row.blocked)continue;const item=await claim(row.id);if(!item)continue;try{await send(item);await finish(item);await context.refresh();}catch(error){await finish(item,error);context.report('대기 녹음: '+error.message);if(!error.code)break;}}
    }catch(error){context.report(error.message);}finally{running=false;context.busy(false);await reload().catch(()=>{});}
  }
  root.RelayF11={enabled,enqueue,flush,pending:verse=>enabled()&&items.some(r=>r.verse<=verse&&r.endVerse>=verse),hasPending:()=>enabled()&&items.length>0,
    retryable:error=>!error.code||['BUSY','INTERNAL_ERROR'].includes(error.code),
    init(next){context=next;if(!enabled())return;document.getElementById('f11-controls').hidden=false;
      document.getElementById('f11-retry').onclick=async()=>{if(running)return;try{await transaction(true,s=>{s.getAll().onsuccess=e=>{for(const item of e.target.result)if(item.scope===scope)s.put({...item,blocked:false,message:''});};});await flush();}catch(error){context.report(error.message);}};
      root.addEventListener('online',()=>flush());setInterval(()=>flush(),30000);
      root.RelayStorage.queueScope().then(value=>{scope=value;return reload();}).then(()=>flush()).catch(error=>context.report(error.message));
    }
  };
})(globalThis);
