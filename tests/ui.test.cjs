const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){
 const elements=new Map();
 class Element{constructor(){this.value='';this.disabled=false;this.hidden=false;this.listeners={};this.children=[];this.classList={add(){},remove(){}};this.style={};}append(...c){this.children.push(...c)}replaceChildren(){this.children=[]}addEventListener(t,f){this.listeners[t]=f}querySelector(){return this.button||(this.button=new Element())}after(){}remove(){}setAttribute(){}showModal(){this.open=true}close(){this.open=false}scrollIntoView(){}removeAttribute(){}load(){}pause(){}focus(){}async play(){}}
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 $('review').hidden=true;
 let failUpload=false, conflict=false, reads=[], uploads=[], records=[], released=false;
 const api={connected:true,readerName:'민수',setReaderName(){},acceptLink(){},async load(){return {text:{title:'제목',verses:['첫 절','둘째 절'],revision:'r1'},recordings:records}},async request(action,fields){
 if(action==='uploadRecording'){uploads.push(fields);if(failUpload)throw Error('network');const item={verse:fields.verse,readerName:fields.readerName};records=records.filter(r=>r.verse!==item.verse).concat(item);return item}
 if(action==='getAudio'){reads.push(fields);return {mimeType:'audio/webm',audioBase64:'YQ=='}}
 if(action==='saveText'){if(conflict){const e=Error('changed');e.code='CONFLICT';throw e}return {...fields,revision:'r2'}}
 }};
 class Recorder{static isTypeSupported(){return true}constructor(){this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'])});this.onstop()}}
 class Reader{readAsDataURL(){this.result='data:audio/webm;base64,dm9pY2U=';this.onload()}}
 const ctx=vm.createContext({setTimeout,clearTimeout,requestAnimationFrame: fn => fn(),console,Blob,Uint8Array,atob,FileReader:Reader,MediaRecorder:Recorder,Audio:Element,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},RelayStorage:api,document:{getElementById:$,createElement:()=>new Element(),addEventListener(){}},window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){released=true}}]})}},location:{},history:{}});
 vm.runInContext(fs.readFileSync('ui.js','utf8'),ctx);
 return {$,ctx,uploads,reads,setFailure:v=>failUpload=v,setConflict:v=>conflict=v,released:()=>released};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('공유 녹음 저장·교체·실패 보존·재생 및 본문 삭제 동의',async()=>{
 const s=setup();await tick();s.$('reader').value='민수';assert.equal(s.$('review').hidden,true);
 await s.ctx.start({preventDefault(){}});assert.equal(s.$('review').hidden,true);s.ctx.stop();
 assert.equal(s.released(),true);assert.equal(s.$('review').hidden,false);
 s.setFailure(true);await s.$('ok').onclick();assert.equal(s.$('review').hidden,false);
 s.setFailure(false);await s.$('ok').onclick();assert.equal(s.$('review').hidden,true);
 assert.equal(s.uploads[0].revision,'r1');assert.equal(s.uploads[0].verse,1);assert.equal(s.uploads[0].audioBase64,'dm9pY2U=');
 await s.ctx.play(0);await tick();assert.equal(s.reads[0].verse,1);
 await s.ctx.start({preventDefault(){}});assert.equal(s.$('review').hidden,true);s.ctx.stop();await s.$('ok').onclick();assert.equal(s.uploads.at(-1).verse,1);
 s.$('text-input').value='새 제목\n첫 문단\n이어지는 줄\n\n둘째 문단';await s.$('save-text').onclick();assert.match(s.$('st').textContent,/동의/);
 s.$('erase-confirm').checked=true;await s.$('save-text').onclick();assert.equal(s.$('heading').textContent,'새 제목');assert.equal(s.$('list').children.length,2);
});
test('녹음 시작·정지·취소와 페이지 편집·충돌 처리',async()=>{
 const s=setup();await tick();s.$('reader').value='민수';
 await s.ctx.start({preventDefault(){}});assert.equal(vm.runInContext('recorder.state',s.ctx),'recording');assert.equal(s.$('review').hidden,true);s.ctx.stop();assert.equal(s.$('review').hidden,false);assert.equal(s.$('list').children[0].children[1],s.$('review'));s.$('no').onclick();
 const parsed=s.ctx.parsePages('첫 줄\n\n둘째 줄\n\n---\n\n셋째 줄');assert.equal(parsed.verses.length,3);assert.equal(parsed.pageStarts.join(','),'0,2');
 s.setConflict(true);s.$('text-input').value='새 제목\n새 절';s.$('erase-confirm').checked=true;await s.$('save-text').onclick();assert.match(s.$('st').textContent,/본문이 변경됨/);assert.equal(s.$('save-text').disabled,true);assert.equal(s.$('refresh').disabled,false);
});

test('장 제목·시작 절 편집과 출력 형식 왕복',async()=>{
 const s=setup();await tick();
 const parsed=s.ctx.parsePages('@첫 장 | 10\n첫 줄\n\n둘째 줄\n\n---\n\n@다음 장 | 20\n셋째 줄');
 assert.equal(parsed.chapters[0].title,'첫 장');assert.equal(parsed.chapters[0].startVerse,10);assert.equal(parsed.chapters[1].startVerse,20);
 s.$('text-input').value='본문\n@첫 장 | 10\n첫 줄\n\n둘째 줄\n\n---\n\n@다음 장 | 20\n셋째 줄';s.$('erase-confirm').checked=true;await s.$('save-text').onclick();
 assert.equal(s.$('page-label').textContent,'첫 장 · 10~11절 ▾');s.$('next-page').onclick();assert.equal(s.$('page-label').textContent,'다음 장 · 20~20절 ▾');
 assert.match(s.ctx.editorText(),/@다음 장 \| 20/);
});

test('책 편집 왕복, 책 경계 장 이동 및 66권 선택',async()=>{
 const s=setup();await tick();
 const input='교재\n# 첫 책\n@1장 | 1\n첫 줄\n\n---\n\n@2장 | 2\n둘째 줄\n\n# 둘째 책\n@1장 | 1\n셋째 줄';
 s.$('text-input').value=input;s.$('erase-confirm').checked=true;await s.$('save-text').onclick();
 assert.equal(s.$('book-open').textContent,'📖 첫 책 ▾');s.$('next-page').onclick();s.$('next-page').onclick();assert.equal(s.$('book-open').textContent,'📖 둘째 책 ▾');
 const roundtrip=s.ctx.parsePages(s.ctx.editorText().split('\n').slice(1).join('\n'));
 assert.equal(roundtrip.books.length,2);assert.equal(roundtrip.books[1].startChapter,2);assert.equal(roundtrip.verses.join(','),'첫 줄,둘째 줄,셋째 줄');
 s.$('text-input').value='66권\n'+Array.from({length:66},(_,i)=>`# 책${i+1}\n@1장 | 1\n내용${i+1}`).join('\n\n');s.$('erase-confirm').checked=true;await s.$('save-text').onclick();
 s.$('book-open').onclick();assert.equal(s.$('picker-items').children.length,39);s.ctx.setBookSide(1);assert.equal(s.$('picker-items').children.length,93);s.$('picker-items').children[92].onclick();assert.equal(s.$('picker-items').children.length,1);s.$('picker-items').children[0].onclick();assert.equal(s.$('book-open').textContent,'📖 책66 ▾');assert.equal(s.$('book-picker').open,false);
});
