/* F12 exports only persisted recordings, once per first-verse key, in chapter order. */
(function(root){
  'use strict';
  let context,result=null,resultKey=null,url=null,working=false,mixed=false;const ids=new WeakMap();let next=0;
  const enabled=()=>!!root.RelayFeatures?.enabled('F12');
  const $=id=>document.getElementById(id);
  function key(snapshot){return JSON.stringify([$('f12-with-music')?.checked,root.RelayF15?.exportKey(snapshot),snapshot.revision,snapshot.from,snapshot.to,snapshot.items.map(item=>{if(item.blob&&!ids.has(item.blob))ids.set(item.blob,++next);return [item.verse,item.endVerse,item.playbackUrl||ids.get(item.blob)];})]);}
  function clear(){if(url)URL.revokeObjectURL(url);url=null;result=null;resultKey=null;}
  function paint(){if(!context)return;$('f12-controls').hidden=!enabled();if(!enabled())return;$('f12-with-music').disabled=working||context.locked();const snapshot=context.snapshot();if(resultKey&&resultKey!==key(snapshot))clear();$('f12-build').disabled=working||context.locked()||!context.ready()||!snapshot.items.length||snapshot.complete===false;
    const count=snapshot.items.reduce((n,r)=>n+(r.endVerse??r.verse)-r.verse+1,0);if(!working)$('f12-status').textContent=result?('합본 준비 완료 · '+(mixed?'음악 포함':'목소리만')):`녹음된 ${count}/${snapshot.to-snapshot.from}절 · 대기 녹음 제외`;
    $('f12-download').hidden=!result;$('f12-share').hidden=!result||!navigator.share||!navigator.canShare?.({files:[result]});if(result){$('f12-download').href=url;$('f12-download').download=result.name;}
  }
  async function build(){if(working||context.locked()||!context.ready())return;const snapshot=context.snapshot(),requestKey=key(snapshot);if(!snapshot.items.length||snapshot.complete===false)return;working=true;context.busy(true);clear();paint();
    try{const chunks=[],originals=[];let total=0;
      for(let i=0;i<snapshot.items.length;i++){
        $('f12-status').textContent=`합본 만드는 중 ${i+1}/${snapshot.items.length}`;
        const blob=await context.audio(snapshot.items[i],snapshot.revision),decoded=await RelayAudio.decode(blob),pcm=RelayAudio.mono(decoded);if($('f12-with-music').checked)originals.push(decoded);total+=pcm.length;
        const gain=root.RelayMix?.level(decoded).gain||1;for(let k=0;k<pcm.length;k++)pcm[k]*=gain;if(total>RelayAudio.RATE*60*15)throw Error('합본은 15분 이하만 가능');chunks.push(pcm);
      }
      const pcm=new Float32Array(total);let offset=0;for(const chunk of chunks){pcm.set(chunk,offset);offset+=chunk.length;}
      const filename=(snapshot.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'낭독')+'.wav';
      let audio=null;if($('f12-with-music')?.checked&&root.RelayF15){await RelayF15.ensure();if(RelayF15.hasMusic(snapshot))audio=await RelayMix.exportChapter(originals,ctx=>RelayF15.exportMusic(ctx,snapshot),RelayF15.volume());}if(key(snapshot)!==requestKey)throw Error('음악 설정이 바뀜 · 합본을 다시 만들기');mixed=!!audio;result=new File([audio||RelayAudio.wav(pcm)],filename,{type:'audio/wav'});url=URL.createObjectURL(result);resultKey=requestKey;let at=mixed?.15:0;result.relayCues=chunks.map((chunk,i)=>{const cue={verse:snapshot.items[i].verse,start:at,duration:chunk.length/RelayAudio.RATE};at+=cue.duration+(mixed?RelayMix.GAP:0);return cue;});return result;
    }catch(error){context.report('합본 실패: '+error.message);}
    finally{working=false;context.busy(false);paint();}
  }
  root.RelayF12={build,enabled,paint,init(next){context=next;try{const saved=localStorage.getItem('relay.export.music.v1');if(saved!==null)$('f12-with-music').checked=saved==='1';}catch(_){}$('f12-with-music').onchange=()=>{try{localStorage.setItem('relay.export.music.v1',$('f12-with-music').checked?'1':'0');}catch(_){}clear();paint();root.RelayF16?.paint();};$('f12-build').onclick=build;$('f12-share').onclick=async()=>{if(!result)return;try{await navigator.share({files:[result],title:result.name});}catch(error){if(error.name!=='AbortError')context.report('공유 실패 · WAV 내려받기 사용');}};paint();root.addEventListener('pagehide',clear);}};
})(globalThis);
