/* F8: parse pasted numbered scripture into the existing book/chapter/verse arrays. */
(function(root){
  'use strict';
  const names='창세기,출애굽기,레위기,민수기,신명기,여호수아,사사기,룻기,사무엘상,사무엘하,열왕기상,열왕기하,역대상,역대하,에스라,느헤미야,에스더,욥기,시편,잠언,전도서,아가,이사야,예레미야,예레미야애가,에스겔,다니엘,호세아,요엘,아모스,오바댜,요나,미가,나훔,하박국,스바냐,학개,스가랴,말라기,마태복음,마가복음,누가복음,요한복음,사도행전,로마서,고린도전서,고린도후서,갈라디아서,에베소서,빌립보서,골로새서,데살로니가전서,데살로니가후서,디모데전서,디모데후서,디도서,빌레몬서,히브리서,야고보서,베드로전서,베드로후서,요한일서,요한이서,요한삼서,유다서,요한계시록'.split(',');
  const short='창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');
  const aliases=Object.fromEntries(names.flatMap((name,i)=>[[name,name],[short[i],name]]));
  const enabled=()=>!!root.RelayFeatures?.enabled('F8');
  function parse(source,title='본문'){
    if(typeof source!=='string' || !source.trim() || source.length>500000)throw Error('본문 크기 확인');
    const result={title:title.trim(),verses:[],pageStarts:[],chapters:[],books:[]};
    const groupMarkers=[];
    let book=result.title || '본문', chapter='1장', page=null, last=0, start=1, paragraph=true, pending=null;
    const fullBook=value=>aliases[value.trim()] || value.trim();
    function setBook(value){const next=fullBook(value);if(next!==book){book=next;chapter='1장';page=null;start=1;}paragraph=true;}
    function setChapter(value,number=1,force=false){if(force || chapter!==value){chapter=value;page=null;start=number;}paragraph=true;}
    function add(text,number){
      if(!text.trim())throw Error('절 내용 필요');
      if(page===null){
        if(result.books.at(-1)?.title!==book){if(result.books.some(item=>item.title===book))throw Error('같은 책은 한 덩어리로 붙여넣기');result.books.push({title:book,startChapter:result.chapters.length});}
        const currentBook=result.books.at(-1);if(result.chapters.slice(currentBook.startChapter).some(item=>item.title===chapter))throw Error('같은 장은 한 덩어리로 붙여넣기');
        const first=number??start;if(!Number.isSafeInteger(first)||first<1||first>1000000)throw Error('절 번호 확인');
        page=result.chapters.length;result.pageStarts.push(result.verses.length);result.chapters.push({title:chapter,startVerse:first});last=first-1;
      }
      const next=number??last+1;if(!Number.isSafeInteger(next)||next!==last+1)throw Error('절 번호는 장 안에서 연속이어야 함');
      result.verses.push(text.trim());last=next;paragraph=false;
    }
    const rows=source.replace(/\r\n?/g,'\n').split('\n');
    for(const raw of rows){
      const line=raw.trim();if(!line){paragraph=true;continue;}
      let match;
      if(root.RelayF9?.enabled() && (match=line.match(/^\|\s*([1-9][0-9]*)\s*[-–]\s*([1-9][0-9]*)$/))){groupMarkers.push({book,chapter,start:Number(match[1]),end:Number(match[2])});continue;}
      if(pending!==null){if(/^(?:#|@|---$)/.test(line))throw Error('절 내용 필요');add(line,pending);pending=null;continue;}
      if((match=line.match(/^#\s+(.+)$/))){if(pending!==null)throw Error('절 내용 필요');setBook(match[1]);continue;}
      if(aliases[line]){if(pending!==null)throw Error('절 내용 필요');setBook(line);continue;}
      if((match=line.match(/^@([^|]+)\|\s*([1-9][0-9]*)$/))){setChapter(match[1].trim(),Number(match[2]),true);continue;}
      if(line==='---'){setChapter(`${Number(chapter.match(/^(\d+)장$/)?.[1] || 0)+1}장`,1,true);continue;}
      if((match=line.match(/^(.+?)\s+([1-9][0-9]*)장$/))){setBook(match[1]);setChapter(match[2]+'장');continue;}
      if((match=line.match(/^([1-9][0-9]*)장$/))){setChapter(match[1]+'장');continue;}
      if((match=line.match(/^(.+?)\s*([1-9][0-9]*):([1-9][0-9]*)\s+(.+)$/)) && /[가-힣A-Za-z]/.test(match[1])){
        setBook(match[1]);setChapter(match[2]+'장',Number(match[3]));add(match[4],Number(match[3]));continue;
      }
      if((match=line.match(/^([1-9][0-9]*):([1-9][0-9]*)\s+(.+)$/))){setChapter(match[1]+'장',Number(match[2]));add(match[3],Number(match[2]));continue;}
      if((match=line.match(/^(.+?)\s*([1-9][0-9]*):([1-9][0-9]*)$/)) && /[가-힣A-Za-z]/.test(match[1])){setBook(match[1]);setChapter(match[2]+'장',Number(match[3]));pending=Number(match[3]);continue;}
      if((match=line.match(/^([1-9][0-9]*):([1-9][0-9]*)$/))){setChapter(match[1]+'장',Number(match[2]));pending=Number(match[2]);continue;}
      if((match=line.match(/^([1-9][0-9]*)(?:[.)]\s*|\s+)(.+)$/))){add(match[2],Number(match[1]));continue;}
      if(/^[1-9][0-9]*$/.test(line)){if(pending!==null)throw Error('절 내용 필요');pending=Number(line);continue;}
      if(pending!==null){add(line,pending);pending=null;continue;}
      if(paragraph || page===null)add(line);else result.verses[result.verses.length-1]+='\n'+line;
    }
    if(pending!==null)throw Error('절 내용 필요');if(page===null && result.verses.length)throw Error('빈 장 내용 확인');if(root.RelayF9?.enabled())result.groups=root.RelayF9.fromMarkers(result,groupMarkers);validate(result);return result;
  }
  function validate(text){
    if(!text || typeof text.title!=='string' || !text.title.trim() || text.title.length>200 || !Array.isArray(text.verses) || !text.verses.length || text.verses.length>500 || text.verses.some(v=>typeof v!=='string'||!v.trim()||v.length>10000) || JSON.stringify(text).length>500000)throw Error('제목·본문 길이 확인');
    if(!Array.isArray(text.pageStarts)||!text.pageStarts.length||text.pageStarts[0]!==0||text.pageStarts.some((n,i)=>!Number.isInteger(n)||n<0||n>=text.verses.length||(i>0&&n<=text.pageStarts[i-1])))throw Error('장 구분 확인');
    if(!Array.isArray(text.chapters)||text.chapters.length!==text.pageStarts.length||text.chapters.some(c=>!c||typeof c.title!=='string'||!c.title.trim()||c.title.length>80||!Number.isInteger(c.startVerse)||c.startVerse<1||c.startVerse>1000000))throw Error('장 정보 확인');
    if(text.groups!==undefined && root.RelayF9)root.RelayF9.validate(text.groups,text);
    if(!Array.isArray(text.books)||!text.books.length||text.books[0].startChapter!==0||text.books.some((b,i)=>!b||typeof b.title!=='string'||!b.title.trim()||b.title.length>80||!Number.isInteger(b.startChapter)||b.startChapter<0||b.startChapter>=text.chapters.length||(i>0&&b.startChapter<=text.books[i-1].startChapter)))throw Error('책 정보 확인');
  }
  let context=null, candidate=null;
  const $=id=>document.getElementById(id);
  root.RelayF8={enabled,parse,validate,
    remember(text){if(enabled()&&!root.RelayStorage.connected)localStorage.setItem('relay.import.v1',JSON.stringify(text));},
    restore(){if(!enabled()||root.RelayStorage.connected)return null;try{const text=JSON.parse(localStorage.getItem('relay.import.v1')||'null');validate(text);return text;}catch(_){return null;}},
    init(ctx){
      context=ctx;$('f8-open').hidden=!enabled();if(!enabled())return;
      function invalidate(){candidate=null;$('f8-save').disabled=true;$('f8-preview').replaceChildren();$('f8-consent').checked=false;}
      $('f8-source').oninput=$('f8-title').oninput=invalidate;
      $('f8-open').onclick=()=>{if(context.locked())return;$('settings').close();$('f8-import').showModal();};
      $('f8-preview-button').onclick=()=>{
        invalidate();try{
          const text=parse($('f8-source').value,$('f8-title').value);candidate={text,source:$('f8-source').value,title:$('f8-title').value};
          const summary=document.createElement('p');summary.textContent=`${text.books.length}권 · ${text.chapters.length}장 · ${text.verses.length}절`+(text.groups?.length?` · ${text.groups.length}묶음`:'');$('f8-preview').append(summary);
          text.chapters.forEach((chapter,index)=>{const heading=document.createElement('b');const book=text.books.findLast(b=>b.startChapter<=index);heading.textContent=book.title+' '+chapter.title;$('f8-preview').append(heading);const list=document.createElement('ol');list.start=chapter.startVerse;for(const verse of text.verses.slice(text.pageStarts[index],text.pageStarts[index+1]??text.verses.length)){const li=document.createElement('li');const position=text.pageStarts[index]+list.children.length+1;const group=text.groups?.find(g=>g.start===position);li.textContent=verse+(group?` [${chapter.startVerse+group.start-text.pageStarts[index]-1}–${chapter.startVerse+group.end-text.pageStarts[index]-1} 묶음]`:'');list.append(li);}$('f8-preview').append(list);});
          $('f8-status').textContent='';$('f8-save').disabled=false;
        }catch(error){$('f8-status').textContent=error.message;}
      };
      $('f8-save').onclick=async()=>{
        if(!candidate || context.locked())return;
        if(candidate.source!==$('f8-source').value || candidate.title!==$('f8-title').value){invalidate();return;}
        if(!$('f8-consent').checked){$('f8-status').textContent='기존 녹음 삭제 동의 필요';return;}
        $('f8-save').disabled=true;
        try{await context.save(candidate.text);$('f8-import').close();invalidate();}
        catch(error){$('f8-status').textContent=error.message;$('f8-save').disabled=false;}
      };
    }
  };
})(globalThis);
