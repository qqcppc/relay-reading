/* F7: advisory signal checks only. No automatic deletion or upload rejection. */
(function(root){
  function measure(channels,duration){
    const warnings=[];if(duration<.7)warnings.push('short');
    let peak=0,sum=0,count=0;
    for(const samples of channels){
      const stride=Math.max(1,Math.floor(samples.length/200000));
      for(let i=0;i<samples.length;i+=stride){const value=samples[i];peak=Math.max(peak,Math.abs(value));sum+=value*value;count++;}
    }
    if(!count || peak<.003)warnings.push('silent');else if(Math.sqrt(sum/count)<.015)warnings.push('quiet');
    return warnings;
  }
  root.RelayF7={enabled:()=>!!root.RelayFeatures?.enabled('F7'),measure,
    async analyze(blob,duration){
      const Audio=root.AudioContext || root.webkitAudioContext;
      if(!Audio)return [...(duration<.7?['short']:[]),'unavailable'];
      let context;
      try{
        context=new Audio();const decoded=await context.decodeAudioData(await blob.arrayBuffer());
        return measure(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),Math.min(duration,decoded.duration));
      }catch(_){return [...(duration<.7?['short']:[]),'unavailable'];}
      finally{if(context)await context.close().catch(()=>{});}
    },
    label(warnings){const names={short:'짧음',silent:'무음',quiet:'작은 소리',unavailable:'검사 불가'};return warnings.length?'녹음 확인 · '+warnings.map(code=>names[code]).join(' · ')+(warnings.includes('unavailable')?'':' · 다시 녹음'):'';}
  };
})(globalThis);
