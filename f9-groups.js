/* F9: non-overlapping reading units within a chapter. Wire indices stay 1-based. */
(function(root){
  'use strict';
  let groups=[],context=null,editing=false,selection=new Set(),proposal=null,saving=false;
  const enabled=()=>!!root.RelayFeatures?.enabled('F9');
  const $=id=>document.getElementById(id);
  function validate(list,text){
    if(!Array.isArray(list)||list.length>text.verses.length)throw Error('묶음 형식 확인');
    let previous=0;
    return list.map(group=>{
      if(!group||!Number.isInteger(group.start)||!Number.isInteger(group.end)||group.start<=previous||group.end<=group.start||group.start<1||group.end>text.verses.length)throw Error('묶음 범위·겹침 확인');
      const page=(text.pageStarts||[0]).findLastIndex(start=>start<group.start);
      if(group.end>((text.pageStarts||[0])[page+1]??text.verses.length))throw Error('묶음은 같은 장 안에서만 가능');
      previous=group.end;return {start:group.start,end:group.end};
    });
  }
  function canonical(index){const group=groups.find(item=>item.start<=index+1&&item.end>=index+1);return group?{start:group.start-1,end:group.end-1}:{start:index,end:index};}
  function unit(index){return enabled()?canonical(index):{start:index,end:index};}
  function changed(record,next){const index=record.verse-1,group=next.find(g=>g.start<=record.verse&&g.end>=record.verse);return (group?.start??index+1)!==record.verse || (group?.end??index+1)!==(record.endVerse??record.verse);}
  function paint(){
    if(!context)return;
    $('f9-controls').hidden=!enabled();$('f9-tools').hidden=!enabled()||!editing||!selection.size;
    const selected=[...selection].map(canonical);$('f9-merge').textContent=selected.length>1?context.label(Math.min(...selected.map(g=>g.start)),Math.max(...selected.map(g=>g.end)))+' 묶기':'묶기';
    $('f9-merge').disabled=selection.size<2||saving;$('f9-split').disabled=!selection.size||saving;
  }
  async function persist(next,discard){
    if(saving||context.locked())return;saving=true;paint();
    try{await context.save(next,discard);groups=next;selection.clear();proposal=null;$('f9-confirm').close();context.render();$('f9-status').textContent='';}
    catch(error){if(error.code==='RECORDINGS_EXIST'){proposal=next;$('f9-consent').checked=false;$('f9-confirm').showModal();}else {$('f9-status').textContent=error.message;context.report(error.message);}}
    finally{saving=false;paint();}
  }
  function propose(split){
    if(!selection.size||saving||context.locked())return;
    try{
      const chosen=[...selection].map(canonical),start=Math.min(...chosen.map(g=>g.start)),end=Math.max(...chosen.map(g=>g.end));
      let next;
      if(split)next=groups.filter(group=>!chosen.some(g=>g.start<group.end&&g.end>=group.start-1));
      else{if(selection.size<2)throw Error('카드 2개 이상 선택');next=groups.filter(group=>group.end<start+1||group.start>end+1).concat({start:start+1,end:end+1}).sort((a,b)=>a.start-b.start);}
      next=validate(next,context.text());
      if(context.records().some(record=>!record.demo&&changed(record,next))){proposal=next;$('f9-consent').checked=false;$('f9-confirm').showModal();}
      else persist(next,false);
    }catch(error){$('f9-status').textContent=error.message;context.report(error.message);}
  }
  root.RelayF9={enabled,validate,canonical,unit,changed,
    raw:()=>groups.map(g=>({...g})),
    set(list,text){groups=validate(list||[],text);selection.clear();},
    editing:()=>enabled()&&editing,
    selected:index=>{if(!enabled()||!selection.size)return false;const chosen=[...selection].map(canonical);return index>=Math.min(...chosen.map(g=>g.start))&&index<=Math.max(...chosen.map(g=>g.end));},
    select(index){if(!enabled()||!editing||saving||context.locked())return;const start=canonical(index).start;if(selection.has(start))selection.delete(start);else selection.add(start);context.render();paint();},
    clear(){selection.clear();paint();},
    fromMarkers(text,markers){
      const list=markers.map(marker=>{
        const book=text.books.find(b=>b.title===marker.book);if(!book)throw Error('묶음 책 확인');
        const end=text.books[text.books.indexOf(book)+1]?.startChapter??text.chapters.length;
        const index=text.chapters.findIndex((chapter,i)=>i>=book.startChapter&&i<end&&chapter.title===marker.chapter);if(index<0)throw Error('묶음 장 확인');
        return {start:text.pageStarts[index]+marker.start-text.chapters[index].startVerse+1,end:text.pageStarts[index]+marker.end-text.chapters[index].startVerse+1};
      }).sort((a,b)=>a.start-b.start);
      return validate(list,text);
    },
    clearCache(){try{localStorage.removeItem('relay.groups.v1');}catch(_){}},
    remember(next){localStorage.setItem('relay.groups.v1',JSON.stringify({signature:JSON.stringify(context.text()),groups:next}));},
    init(ctx){
      context=ctx;paint();if(!enabled())return;
      if(!root.RelayStorage.connected){try{const saved=JSON.parse(localStorage.getItem('relay.groups.v1')||'null');if(saved?.signature===JSON.stringify(context.text()))groups=validate(saved.groups,context.text());}catch(_){}context.render();}
      $('f9-edit').onchange=()=>{if(context.locked()){ $('f9-edit').checked=editing;return;}editing=$('f9-edit').checked;selection.clear();context.render();paint();};
      $('f9-merge').onclick=()=>propose(false);$('f9-split').onclick=()=>propose(true);$('f9-cancel').onclick=()=>{selection.clear();editing=false;$('f9-edit').checked=false;context.render();paint();};
      $('f9-confirm-save').onclick=()=>{if(proposal&&$('f9-consent').checked)persist(proposal,true);};
    },paint
  };
})(globalThis);
