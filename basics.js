/* Baseline gestures: deliberate swipes, double-tap capture, long-press range actions. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  let context=null,anchor=null,extent=null,marker=null,working=false,singleTimer=null,lastTap=null,holdTimer=null,headerTimer=null,gesture=null,suppressed=null;
  const active=()=>anchor!==null;
  function range(a,b){return {start:Math.min(a.start,b.start),end:Math.max(a.end,b.end)};}
  const selected=()=>active()?range(anchor,extent):null;
  const direction=(dx,dy,vertical)=>!vertical&&Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*2?(dx<0?1:-1):0;
  function cancelGesture(){clearTimeout(singleTimer);singleTimer=null;clearTimeout(holdTimer);holdTimer=null;clearTimeout(headerTimer);headerTimer=null;gesture=null;}
  function paint(){if(!context)return;const r=selected();$('selection-panel').hidden=!r;document.body.classList.toggle('range-mode',!!r);if(!r)return;
    const mine=context.owned(r);$('selection-label').textContent=context.label(r);$('selection-delete').hidden=!mine.length;$('selection-delete').disabled=working||!context.ready();$('selection-copy').disabled=working;
  }
  function clear(back=true){if(!active())return;anchor=extent=null;lastTap=null;cancelGesture();$('selection-copy-text').hidden=true;const old=marker;marker=null;if(back&&old&&history.state?.relaySelection===old)history.back();context.render();}
  function select(index){if(context.locked()||!context.ready())return;context.stop();lastTap=null;cancelGesture();const span=context.unit(index);
    if(!active()){anchor=span;marker=crypto.randomUUID();try{history.pushState({relaySelection:marker},'');}catch(_){marker=null;}}
    extent=span;context.render();
  }
  function tap(index,event){if(suppressed?.index===index&&Date.now()-suppressed.time<900){suppressed=null;return;}suppressed=null;
    if(active()){select(index);return;}if(context.groupEditing())return;
    clearTimeout(singleTimer);singleTimer=null;context.stop();context.point(index);
    if(event?.detail===0){lastTap=null;context.locate(index);return;}
    if(lastTap?.index===index&&Date.now()-lastTap.time<350){lastTap=null;context.record(index);return;}
    lastTap={index,time:Date.now()};singleTimer=setTimeout(()=>{singleTimer=null;lastTap=null;if(!context.locked())context.locate(index);},350);
  }
  function wireCard(element,index){
    element.addEventListener('contextmenu',event=>event.preventDefault());
    element.addEventListener('pointerdown',event=>{if(context.locked()||!context.ready()||event.isPrimary===false||event.button>0)return;suppressed=null;clearTimeout(singleTimer);singleTimer=null;clearTimeout(holdTimer);gesture={x:event.clientX,y:event.clientY};
      holdTimer=setTimeout(()=>{if(!gesture)return;suppressed={index,time:Date.now()};lastTap=null;if(context.groupEditing())context.group(index);else select(index);},450);
    });
    element.addEventListener('pointermove',event=>{if(gesture&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>12){clearTimeout(holdTimer);holdTimer=null;gesture=null;lastTap=null;}});
    for(const type of ['pointerup','pointercancel','pointerleave'])element.addEventListener(type,()=>{clearTimeout(holdTimer);holdTimer=null;gesture=null;});
    element.addEventListener('keydown',event=>{if(context.locked()||!context.ready())return;if(event.key.toLowerCase()==='r'){event.preventDefault();if(context.groupEditing())context.group(index);else{clear();context.record(index);}}else if(event.shiftKey&&event.key===' '){event.preventDefault();select(index);}});
  }
  function wireSwipe(element){let touch=null;
    element.addEventListener('touchstart',event=>{if(event.touches.length!==1){touch=null;return;}touch={x:event.touches[0].clientX,y:event.touches[0].clientY||0,vertical:false};},{passive:true});
    element.addEventListener('touchmove',event=>{if(!touch)return;const dx=event.touches[0].clientX-touch.x,dy=(event.touches[0].clientY||0)-touch.y;if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx))touch.vertical=true;},{passive:true});
    element.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
    root.addEventListener('scroll',()=>{if(touch)touch.vertical=true;lastTap=null;clearTimeout(singleTimer);singleTimer=null;},{passive:true});
    element.addEventListener('touchend',event=>{if(!touch)return;const dx=event.changedTouches[0].clientX-touch.x,dy=(event.changedTouches[0].clientY||0)-touch.y,step=direction(dx,dy,touch.vertical);touch=null;if(step&&!context.locked()&&context.ready()){cancelGesture();lastTap=null;clear();context.page(step);}},{passive:true});
  }
  function header(){let down=null,held=false;const element=$('title-btn');
    $('tb-book').onclick=null;$('tb-ch').onclick=null;$('settings-open').onclick=null;
    element.addEventListener('pointerdown',event=>{if(event.button>0||event.isPrimary===false)return;clearTimeout(singleTimer);singleTimer=null;lastTap=null;held=false;down={x:event.clientX,y:event.clientY};clearTimeout(headerTimer);headerTimer=setTimeout(()=>{if(!down||context.locked())return;held=true;clear();context.sheet();},450);});
    element.addEventListener('pointermove',event=>{if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>12){clearTimeout(headerTimer);down=null;}});
    for(const type of ['pointerup','pointercancel','pointerleave'])element.addEventListener(type,()=>{clearTimeout(headerTimer);down=null;});
    element.addEventListener('click',event=>{if(held){held=false;event.preventDefault();return;}if(context.locked())return;clear();context.books();});
    element.addEventListener('keydown',event=>{if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();context.sheet();}});
    element.addEventListener('contextmenu',event=>event.preventDefault());
  }
  root.RelayBasics={range,direction,paint,clear,cancelGesture,tap,wireCard,contains:index=>{const r=selected();return !!r&&index>=r.start&&index<=r.end;},active,
    init(next){context=next;header();wireSwipe($('list'));
      document.addEventListener('pointerdown',event=>{if(active()&&!working&&!event.target.closest('.card-trigger,#selection-panel'))clear();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active()){event.preventDefault();clear();}});
      root.addEventListener('popstate',()=>{if(active())clear(false);});
      $('selection-copy').onclick=async()=>{const r=selected();if(!r||working)return;working=true;paint();const text=context.copyText(r);try{await navigator.clipboard.writeText(text);clear();context.toast('복사됨');}catch(_){$('selection-copy-text').value=text;$('selection-copy-text').hidden=false;$('selection-copy-text').select();context.toast('길게 눌러 복사');}finally{working=false;paint();}};
      $('selection-delete').onclick=async()=>{const r=selected();if(!r||working||context.locked())return;const items=context.owned(r);if(!items.length)return;if(items.length>1&&!root.confirm(items.length+'개 삭제?'))return;working=true;paint();try{const result=await context.remove(items);clear();context.toast(result.deleted.length+'개 삭제');}catch(error){context.report(error);}finally{working=false;paint();}};
      $('inapp-hint').hidden=!/KAKAOTALK/i.test(navigator.userAgent);paint();
    }
  };
})(globalThis);
