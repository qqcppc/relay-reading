/* F14: user-provided art only. Numeric anchors describe the creation sequence, not scripture text. */
(function(root){
  'use strict';
  const modes='ABCDEFGHIJ';
  const anchors=[[1,0],[3,.12],[6,.26],[9,.41],[14,.55],[20,.70],[24,.88],[31,1]];
  let context=null,frame=null,active=null;
  const enabled=()=>!!root.RelayFeatures?.enabled('F14');
  const reduce=root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const $=id=>document.getElementById(id);
  function mode(book,chapter){const match=String(chapter).match(/^([1-9][0-9]*)장$/),number=Number(match?.[1]);return book==='창세기'&&number<=10?modes[number-1]||null:null;}
  function position(verse){for(let i=1;i<anchors.length;i++){const [end,to]=anchors[i],[start,from]=anchors[i-1];if(verse<=end)return Math.max(0,from+(to-from)*(verse-start)/(end-start));}return 1;}
  function update(){
    frame=null;if(!context||active!=='A'||reduce?.matches||document.hidden)return;
    const state=context.state(),rows=[...$('list').querySelectorAll('.line[data-verse]')];if(!rows.length)return;
    const height=root.innerHeight,readerY=($('sticky')?.getBoundingClientRect().bottom||0)+Math.min(100,height*.12);
    let verse=state.startVerse;
    const reader=$('reading'),scroll=reader.scrollTop,maxScroll=Math.max(0,reader.scrollHeight-reader.clientHeight);
    if(scroll>=maxScroll-2&&maxScroll>0)verse=state.startVerse+state.count-1;
    else if(scroll>0){for(let i=0;i<rows.length;i++){const r=rows[i].getBoundingClientRect();if(r.top>readerY)break;const first=Number(rows[i].dataset.verse)-1,after=rows[i+1]?Number(rows[i+1].dataset.verse)-1:state.from+state.count;verse=state.startVerse+first-state.from+Math.min(1,Math.max(0,(readerY-r.top)/r.height))*(after-first);}}
    $('f14-scene').style.setProperty('--f14-y',(position(verse)*100).toFixed(2)+'%');
  }
  function schedule(){if(active==='A'&&!reduce?.matches&&frame===null)frame=root.requestAnimationFrame(update);}
  function paint(){if(!context)return;const state=context.state(),next=enabled()&&!state.capture&&!root.RelayF16?.active()&&state.count>0?mode(state.book,state.chapter):null;
    if(next!==active){active=next;const scene=$('f14-scene');scene.hidden=!next;scene.dataset.mode=next||'';document.body.classList.toggle('f14-active',!!next);$('f14-label').hidden=!next;
      $('f14-label').textContent=next?'배경 시험 '+next:'';scene.style.removeProperty('--f14-y');}
    document.body.classList.toggle('f14-paused',!!document.hidden);schedule();
  }
  root.RelayF14={enabled,mode,position,paint,init(next){context=next;if(!enabled())return;$('reading').addEventListener('scroll',schedule,{passive:true});root.addEventListener('resize',schedule,{passive:true});document.addEventListener('visibilitychange',paint);reduce?.addEventListener('change',()=>{$('f14-scene').style.removeProperty('--f14-y');paint();});paint();}};
})(globalThis);
