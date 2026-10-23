/* F10 keeps the original take available until confirmation/cancellation. */
(function(root){
  root.RelayF10={enabled:()=>!!root.RelayFeatures?.enabled('F10'),
    async trim(blob){
      const audio=root.RelayAudio,pcm=audio.mono(await audio.decode(blob)),range=audio.bounds(pcm);
      const before=pcm.length/audio.RATE,after=(range.end-range.start)/audio.RATE;
      if(before-after<.1)return {blob,before,after:before,changed:false};
      const trimmed=audio.wav(pcm.subarray(range.start,range.end));
      if(trimmed.size>5*1024*1024)throw Error('자른 파일이 5MiB 초과 · 원본 유지');
      return {blob:trimmed,before,after,changed:true};
    }
  };
})(globalThis);
