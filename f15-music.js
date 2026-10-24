/* F15 library/settings are local to the phone. Only voice reads use the existing API. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),KEY='relay.f15.v1';
  let context=null,current=null,scope=null,working=false,readyPromise=null,files=[],catalog=[],available=true,message='',dbPromise;
  let config={volume:.2,chapters:{}};
  const enabled=()=>!!root.RelayFeatures?.enabled('F15');
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved.volume==='number'&&saved.volume>=0&&saved.volume<=1&&saved.chapters&&typeof saved.chapters==='object'&&!Array.isArray(saved.chapters))config={volume:saved.volume,chapters:Object.fromEntries(Object.entries(saved.chapters).filter(([key,value])=>key.length<500&&typeof value==='string'&&value.length<100).slice(-500))};}catch(_){}
  function manifest(value){const ids=new Set();return (Array.isArray(value?.tracks)?value.tracks:[]).slice(0,30).filter(track=>{if(!track||typeof track.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(track.id)||ids.has(track.id)||typeof track.title!=='string'||!track.title.trim()||track.title.length>120||typeof track.file!=='string'||!/^[\p{L}\p{N}_. -]+\.(mp3|ogg|wav|m4a)$/iu.test(track.file)||track.file.includes('..'))return false;ids.add(track.id);return true;}).map(track=>({...track,id:'asset:'+track.id}));}
  function db(){if(!root.indexedDB)return Promise.reject(Error('이 폰 음악 보관 미지원'));return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('relay.music.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('폰 음악 저장 실패'));r.onblocked=()=>reject(Error('다른 탭을 닫고 다시 시도'));});}
  async function transaction(write,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('files',write?'readwrite':'readonly'),store=tx.objectStore('files');let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('폰 음악 보관 실패 · 용량 확인'));fn(store,value=>{result=value;},tx);});}
  async function reloadFiles(){files=await transaction(false,(store,done)=>{store.getAll().onsuccess=e=>done(e.target.result);});}
  const chapterKey=snapshot=>scope?JSON.stringify([scope,snapshot.book,snapshot.chapter,snapshot.startVerse]):null;
  const selected=snapshot=>config.chapters[chapterKey(snapshot)]||'none';
  const known=id=>['none','tone'].includes(id)||catalog.some(track=>track.id===id)||files.some(file=>file.id===id);
  function options(){const select=$('f15-track');select.replaceChildren();for(const item of [{id:'none',title:'음악 없음'},{id:'tone',title:'잔잔한 시험 소리'},...catalog,...files.map(file=>({id:file.id,title:'이 폰 · '+file.name}))]){const option=document.createElement('option');option.value=item.id;option.textContent=item.title;select.append(option);}}
  function paint(){if(!context)return;$('f15-controls').hidden=!enabled();if(!enabled())return;const snapshot=context.snapshot(),id=selected(snapshot),locked=context.locked();
    $('f15-chapter').textContent=snapshot.book+' '+snapshot.chapter;for(const option of $('f15-track').querySelectorAll('option[data-missing]'))option.remove();if(!known(id)){const missing=document.createElement('option');missing.value=id;missing.textContent='기억한 곡 없음 · 다른 음악 선택';missing.disabled=true;missing.dataset.missing='true';$('f15-track').append(missing);}$('f15-track').value=id;$('f15-track').disabled=working||locked||!scope;
    $('f15-file').disabled=working||locked||!available;$('f15-delete').hidden=!id.startsWith('file:');$('f15-delete').disabled=working||locked;
    $('f15-volume').value=String(Math.round(config.volume*100));$('f15-volume').disabled=locked;$('f15-volume-value').textContent=Math.round(config.volume*100)+'%';
    $('f15-play').textContent=current?'■ 멈춤':'선택 절부터 이어듣기';$('f15-play').disabled=!current&&(working||locked||!context.ready()||!snapshot.tracks.length);
    $('f15-status').textContent=message||(current?(current.phase==='loading'?'전체 듣기 준비 중':'음악과 듣는 중'):'이 장의 곡을 선택 · 폰 파일은 이 폰에만 보관');
  }
  function persist(next){localStorage.setItem(KEY,JSON.stringify(next));config=next;}
  function choose(id,snapshot=context.snapshot()){const key=chapterKey(snapshot);if(!key||!known(id))return;
    try{persist({...config,chapters:Object.fromEntries(Object.entries({...config.chapters,[key]:id}).slice(-500))});context.stop();message='';}
    catch(_){message='장별 음악 선택을 이 폰에 기억할 수 없음';}paint();
  }
  async function loadMusic(ctx,snapshot){await readyPromise;const id=selected(snapshot);if(id==='none')return null;if(id==='tone')return root.RelayMix.tone(ctx);
    let blob;
    if(id.startsWith('asset:')){const track=catalog.find(track=>track.id===id);if(!track)throw Error('선택한 곡 없음 · 음악을 다시 선택');const response=await fetch(new URL('assets/music/'+encodeURIComponent(track.file),location.href));if(!response.ok)throw Error('배경 음악 불러오기 실패');const length=Number(response.headers.get('Content-Length'));if(length>20*1024*1024)throw Error('배경 음악은 20MiB 이하만 가능');blob=await response.blob();}
    else{const file=files.find(file=>file.id===id);if(!file)throw Error('이 폰의 곡이 없음 · 다시 선택');blob=file.blob;}
    if(!blob?.size||blob.size>20*1024*1024)throw Error('배경 음악은 0바이트 초과 20MiB 이하만 가능');let buffer;try{buffer=await ctx.decodeAudioData(await blob.arrayBuffer());}catch(_){throw Error('배경 음악 해독 실패 · 다른 곡 선택');}if(!buffer.length||buffer.duration<.1||buffer.duration>600)throw Error('배경 음악은 0.1초~10분만 가능');return buffer;
  }
  function stop(){const old=current;current=null;old?.stop();paint();}
  function play(snapshot){if(!enabled()||context.locked()||!context.ready())return;if(!snapshot.tracks.length){context.report(Error('이후에 실제 녹음 없음'));return;}
    stop();message='';
    try{const session=root.RelayMix.start({volume:config.volume,tracks:snapshot.tracks,loadVoice:item=>context.audio(item,snapshot.revision),musicKey:item=>JSON.stringify([item.book,item.chapter,item.startVerse]),loadMusic:(ctx,item)=>loadMusic(ctx,item),onVoice:item=>{if(current===session)context.voice(item);}});current=session;context.changed();paint();
      session.done.catch(error=>{if(current===session&&error.name!=='AbortError')context.report(error);}).finally(()=>{if(current===session){current=null;context.end();paint();}});
    }catch(error){context.report(error);context.end();}
  }
  async function importFile(){const file=$('f15-file').files[0];if(!file||working||context.locked())return;const target=context.snapshot();working=true;message='음악 확인 중';paint();let decoder;
    try{
      if(!/\.(mp3|ogg|wav|m4a|webm)$/i.test(file.name))throw Error('mp3·ogg·wav·m4a·webm 음악 파일 선택');
      if(!file.size||file.size>20*1024*1024)throw Error('음악 파일은 0바이트 초과 20MiB 이하만 가능');
      const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)throw Error('이 브라우저는 음악 해독 미지원');decoder=new Audio({sampleRate:24000});let decoded;try{decoded=await decoder.decodeAudioData(await file.arrayBuffer());}catch(_){throw Error('음악 해독 실패 · 다른 파일로 선택');}if(!decoded.length||decoded.duration<.1||decoded.duration>600)throw Error('음악은 0.1초~10분만 가능');
      await transaction(true,(store,done,tx)=>{store.getAll().onsuccess=e=>{const list=e.target.result;if(list.length>=20||list.reduce((sum,item)=>sum+item.blob.size,0)+file.size>100*1024*1024){tx.abort();return;}const id='file:'+crypto.randomUUID();store.add({id,name:file.name.slice(0,120),blob:file,duration:decoded.duration});done(id);};}).then(async id=>{await reloadFiles();options();choose(id,target);});
    }catch(error){message=error.message;}finally{if(decoder)await decoder.close().catch(()=>{});working=false;$('f15-file').value='';paint();}
  }
  root.RelayF15={enabled,active:()=>!!current,play,stop,paint,manifest,
    inspect:()=>current?{phase:current.phase,musicLooping:!!current.musicLooping,stats:current.stats,volume:config.volume}:null,
    init(next){context=next;if(!enabled())return;options();
      $('f15-track').onchange=()=>choose($('f15-track').value);$('f15-file').onchange=importFile;
      $('f15-volume').oninput=()=>{const value=Number($('f15-volume').value)/100;if(!Number.isFinite(value)||value<0||value>1)return;try{persist({...config,volume:value});current?.setVolume(value);message='';}catch(_){message='음악 음량을 이 폰에 기억할 수 없음';}paint();};
      $('f15-play').onclick=()=>{if(current){context.stop();return;}$('settings').close();context.play();};
      $('f15-delete').onclick=async()=>{const id=selected(context.snapshot());if(working||context.locked()||!id.startsWith('file:')||!root.confirm('이 폰에서 이 음악을 지울까? 이 곡을 쓰던 장의 지정도 해제돼.'))return;working=true;paint();try{context.stop();await transaction(true,store=>store.delete(id));await reloadFiles();persist({...config,chapters:Object.fromEntries(Object.entries(config.chapters).filter(([,value])=>value!==id))});options();message='';}catch(error){message=error.message;}finally{working=false;paint();}};
      readyPromise=(async()=>{
        scope=root.RelayStorage.connected?'shared:'+await root.RelayStorage.queueScope():'trial';
        await Promise.all([fetch('assets/music/catalog.json').then(response=>{if(!response.ok)throw Error();return response.json();}).then(value=>{catalog=manifest(value);}).catch(()=>{message='기본 음악 목록 불러오기 실패 · 폰 파일/시험 소리 사용 가능';}),reloadFiles().catch(()=>{available=false;message='이 폰 음악 보관 미지원 · 기본 곡 선택 가능';})]);options();paint();
      })();readyPromise.catch(()=>{message='장별 음악 설정을 불러올 수 없음';paint();});
      root.addEventListener('pagehide',stop);paint();
    }
  };
})(globalThis);
