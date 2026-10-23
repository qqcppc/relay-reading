/* In-memory PCM helpers shared by F10/F12. No voice files are written by the app. */
(function(root){
  'use strict';
  const RATE=24000;
  async function decode(blob){
    const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)throw Error('이 브라우저는 음성 변환 미지원');
    const ctx=new Audio();
    try{return await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close().catch(()=>{});}
  }
  function mono(buffer,rate=RATE){
    const length=Math.ceil(buffer.length*rate/buffer.sampleRate),out=new Float32Array(length);
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const input=buffer.getChannelData(channel);
      for(let i=0;i<length;i++){const pos=i*buffer.sampleRate/rate,at=Math.floor(pos),f=pos-at;out[i]+=((input[at]||0)*(1-f)+(input[Math.min(at+1,input.length-1)]||0)*f)/buffer.numberOfChannels;}
    }return out;
  }
  function wav(samples,rate=RATE){
    const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
    function str(at,s){for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));}
    str(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(v*(v<0?32768:32767)),true);}
    return new Blob([bytes],{type:'audio/wav'});
  }
  function bounds(samples,rate=RATE){
    const frame=Math.max(1,Math.round(rate*.02));let first=-1,last=0;
    for(let i=0;i<samples.length;i+=frame){let sum=0,peak=0;const end=Math.min(i+frame,samples.length);for(let k=i;k<end;k++){sum+=samples[k]*samples[k];peak=Math.max(peak,Math.abs(samples[k]));}if(Math.sqrt(sum/(end-i))>=.002||peak>=.01){if(first<0)first=i;last=end;}}
    if(first<0)return {start:0,end:samples.length};
    return {start:Math.max(0,first-Math.round(rate*.08)),end:Math.min(samples.length,last+Math.round(rate*.08))};
  }
  root.RelayAudio={RATE,decode,mono,wav,bounds};
})(globalThis);
