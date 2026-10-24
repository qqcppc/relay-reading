/* F15 real-time audio graph. All decoded voice/music stays in memory. */
(function(root){
  'use strict';
  const GAP=.22;
  const abort=()=>Object.assign(Error('재생 취소'),{name:'AbortError'});
  function level(buffer,target=.09){
    let peak=0,sum=0,count=0;const stride=Math.max(1,Math.floor(buffer.length/240000));
    for(let c=0;c<buffer.numberOfChannels;c++){const pcm=buffer.getChannelData(c);for(let i=0;i<pcm.length;i+=stride){const value=Math.abs(pcm[i]);peak=Math.max(peak,value);if(value>=.003){sum+=value*value;count++;}}}
    const rms=count?Math.sqrt(sum/count):0;
    return {rms,peak,gain:rms?Math.min(4,Math.max(.15,target/rms),.78/Math.max(peak,.001)):1};
  }
  function speech(buffer){
    const frame=Math.max(1,Math.round(buffer.sampleRate*.04)),threshold=Math.max(.0015,Math.min(.004,level(buffer).rms*.06)),segments=[];
    for(let at=0;at<buffer.length;at+=frame){let sum=0,count=0;for(let c=0;c<buffer.numberOfChannels;c++){const pcm=buffer.getChannelData(c);for(let k=at;k<Math.min(at+frame,pcm.length);k+=4){sum+=pcm[k]*pcm[k];count++;}}
      if(count&&Math.sqrt(sum/count)>=threshold){const start=Math.max(0,at/buffer.sampleRate-.04),end=Math.min(buffer.duration,(at+frame)/buffer.sampleRate+.12),last=segments.at(-1);if(last&&start-last.end<.3)last.end=end;else segments.push({start,end});}
    }return segments;
  }
  function graph(ctx,volume){
    const master=ctx.createGain(),limiter=ctx.createDynamicsCompressor(),musicLevel=ctx.createGain(),musicVolume=ctx.createGain(),duck=ctx.createGain();
    master.gain.value=.9;limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.2;
    musicVolume.gain.value=volume*.45;duck.gain.value=1;musicLevel.connect(musicVolume).connect(duck).connect(limiter);limiter.connect(master).connect(ctx.destination);
    return {master,limiter,musicLevel,musicVolume,duck};
  }
  function voice(ctx,mix,buffer,start){
    const source=ctx.createBufferSource(),gain=ctx.createGain(),stats=level(buffer),segments=speech(buffer),duration=buffer.duration,edge=Math.min(.012,duration/3);
    start=Math.max(start,ctx.currentTime+.015);
    source.buffer=buffer;source.connect(gain).connect(mix.limiter);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(stats.gain,start+edge);gain.gain.setValueAtTime(stats.gain,Math.max(start+edge,start+duration-edge));gain.gain.linearRampToValueAtTime(0,start+duration);
    const param=mix.duck.gain;param.cancelScheduledValues(Math.max(ctx.currentTime,start-.02));param.setValueAtTime(1,Math.max(ctx.currentTime,start-.02));
    for(const segment of segments){const begin=start+segment.start;param.setValueAtTime(1,Math.max(start,begin-.06));param.linearRampToValueAtTime(.22,begin+.005);param.setValueAtTime(.22,start+segment.end);param.linearRampToValueAtTime(1,start+segment.end+.2);}
    source.start(start);return {source,gain,stats,segments,start,duration};
  }
  function loopFade(buffer){
    const edge=Math.min(Math.round(buffer.sampleRate*.12),Math.floor(buffer.length/4));
    for(let c=0;c<buffer.numberOfChannels;c++){const pcm=buffer.getChannelData(c);for(let i=0;i<edge;i++){const fade=i/edge;pcm[i]*=fade;pcm[pcm.length-1-i]*=fade;}}
    return buffer;
  }
  function tone(ctx){
    const buffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate),pcm=buffer.getChannelData(0);
    for(let i=0;i<pcm.length;i++){const t=i/ctx.sampleRate,fade=Math.min(1,t/.3,(8-t)/.3);pcm[i]=fade*(Math.sin(2*Math.PI*130.8128*t)+.65*Math.sin(2*Math.PI*164.8138*t)+.45*Math.sin(2*Math.PI*196*t))*.09*(.85+.15*Math.sin(2*Math.PI*t/8));}return buffer;
  }
  function start(options){
    const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)throw Error('이 브라우저는 음악과 듣기 미지원');
    const ctx=new Audio({sampleRate:24000}),mix=graph(ctx,options.volume),controller=new AbortController(),sources=new Set(),timers=new Set();
    let stopped=false;const stats=[];
    const check=()=>{if(stopped)throw abort();};
    const sleep=ms=>new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(abort());};const timer=setTimeout(()=>{timers.delete(timer);controller.signal.removeEventListener('abort',cancel);resolve();},ms);timers.add(timer);controller.signal.addEventListener('abort',cancel,{once:true});});
    const session={stats,context:ctx,mix,phase:'loading',
      setVolume(value){if(!stopped)mix.musicVolume.gain.setTargetAtTime(value*.45,ctx.currentTime,.05);},
      stop(){if(stopped)return;stopped=true;controller.abort();mix.master.gain.cancelScheduledValues(ctx.currentTime);mix.master.gain.setValueAtTime(0,ctx.currentTime);for(const timer of timers)clearTimeout(timer);timers.clear();for(const source of sources){try{source.stop();source.disconnect();}catch(_){}}sources.clear();ctx.close().catch(()=>{});}
    };
    // Resume synchronously from the user's click, before network/IndexedDB reads.
    const unlocked=ctx.resume();
    session.done=(async()=>{
      try{
        await unlocked;check();
        async function load(item){check();const blob=await options.loadVoice(item);check();let buffer;try{buffer=await ctx.decodeAudioData(await blob.arrayBuffer());}catch(_){check();throw Error('음성 해독 실패 · 해당 절을 다시 확인');}check();if(!buffer.length||buffer.duration>600)throw Error('절 녹음은 10분 이하만 가능');return buffer;}
        let song=null,songKey=null;
        function changeMusic(buffer,key){
          const now=ctx.currentTime;
          if(song){const old=song;old.gain.gain.cancelScheduledValues(now);old.gain.gain.setValueAtTime(old.gain.gain.value,now);old.gain.gain.linearRampToValueAtTime(0,now+.2);old.source.stop(now+.22);}
          song=null;songKey=key;session.musicLooping=!!buffer;
          if(!buffer)return;
          const source=ctx.createBufferSource(),gain=ctx.createGain(),normal=level(buffer,.16).gain;
          source.buffer=loopFade(buffer);source.loop=true;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(normal,now+.2);source.connect(gain).connect(mix.musicLevel);sources.add(source);
          source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};source.start(now);song={source,gain};
        }
        let [initialMusic,buffer]=await Promise.all([options.loadMusic(ctx,options.tracks[0]),load(options.tracks[0])]);check();
        changeMusic(initialMusic,options.musicKey(options.tracks[0]));initialMusic=null;
        mix.master.gain.setValueAtTime(0,ctx.currentTime);mix.master.gain.linearRampToValueAtTime(.9,ctx.currentTime+.15);
        let nextAt=ctx.currentTime+.15;
        for(let i=0;i<options.tracks.length;i++){
          check();const item=options.tracks[i],queued=voice(ctx,mix,buffer,Math.max(nextAt,ctx.currentTime+.02));sources.add(queued.source);stats.push({verse:item.verse,gain:queued.stats.gain,segments:queued.segments,start:queued.start,duration:queued.duration,musicKey:songKey,music:session.musicLooping});
          const timer=setTimeout(()=>{timers.delete(timer);if(!stopped){session.phase='voice';options.onVoice(item);}},Math.max(0,(queued.start-ctx.currentTime)*1000));timers.add(timer);
          const ended=new Promise((resolve,reject)=>{const cancel=()=>reject(abort());queued.source.onended=()=>{controller.signal.removeEventListener('abort',cancel);sources.delete(queued.source);queued.source.disconnect();queued.gain.disconnect();resolve();};controller.signal.addEventListener('abort',cancel,{once:true});});
          // Prefetch at most the next voice and (at chapter boundaries) the next song.
          const nextItem=options.tracks[i+1],newSong=nextItem&&options.musicKey(nextItem)!==songKey;
          const upcoming=nextItem?Promise.all([load(nextItem),newSong?options.loadMusic(ctx,nextItem):null]).then(([buffer,music])=>({buffer,music}),error=>({error})):null;
          await ended;check();session.phase='gap';nextAt=queued.start+queued.duration+GAP;
          if(upcoming){const next=await upcoming;check();if(next.error)throw next.error;buffer=next.buffer;if(newSong)changeMusic(next.music,options.musicKey(nextItem));}
        }
        session.phase='ending';mix.master.gain.cancelScheduledValues(ctx.currentTime);mix.master.gain.setValueAtTime(.9,ctx.currentTime);mix.master.gain.linearRampToValueAtTime(0,ctx.currentTime+.3);await sleep(320);
      }finally{session.stop();}
    })();
    return session;
  }
  root.RelayMix={level,speech,graph,voice,loopFade,tone,start,GAP};
})(globalThis);
