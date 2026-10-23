const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){
 const elements=new Map();
 class Element{constructor(){this.value='';this.disabled=false;this.hidden=false;this.listeners={};this.children=[];this.classList={add(){},remove(){}};this.style={};}append(...c){this.children.push(...c)}replaceChildren(){this.children=[]}addEventListener(t,f){this.listeners[t]=f}querySelector(){return this.button||(this.button=new Element())}scrollIntoView(){}removeAttribute(){}load(){}pause(){}focus(){}async play(){}}
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
 const ctx=vm.createContext({requestAnimationFrame: fn => fn(),console,Blob,Uint8Array,atob,FileReader:Reader,MediaRecorder:Recorder,Audio:Element,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},RelayStorage:api,document:{getElementById:$,createElement:()=>new Element(),addEventListener(){}},window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){released=true}}]})}},location:{},history:{}});
 vm.runInContext(fs.readFileSync('ui.js','utf8'),ctx);
 return {$,ctx,uploads,reads,setFailure:v=>failUpload=v,setConflict:v=>conflict=v,released:()=>released};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('공유 녹음 저장·교체·실패 보존·재생 및 본문 삭제 동의',async()=>{
 const s=setup();await tick();s.$('reader').value='민수';assert.equal(s.$('hold').disabled,false);
 await s.$('hold').listeners.pointerdown({preventDefault(){}});s.$('hold').listeners.pointerup();
 assert.equal(s.released(),true);assert.equal(s.$('review').hidden,false);
 s.setFailure(true);await s.$('ok').onclick();assert.equal(s.$('review').hidden,false);
 s.setFailure(false);await s.$('ok').onclick();assert.equal(s.$('review').hidden,true);
 assert.equal(s.uploads[0].revision,'r1');assert.equal(s.uploads[0].verse,1);assert.equal(s.uploads[0].audioBase64,'dm9pY2U=');
 await s.$('list').children[0].onclick();await tick();assert.equal(s.reads[0].verse,1);
 await s.$('hold').listeners.pointerdown({preventDefault(){}});s.$('hold').listeners.pointerup();await s.$('ok').onclick();assert.equal(s.uploads.at(-1).verse,1);
 s.$('text-input').value='새 제목\n첫 문단\n이어지는 줄\n\n둘째 문단';await s.$('save-text').onclick();assert.match(s.$('st').textContent,/동의/);
 s.$('erase-confirm').checked=true;await s.$('save-text').onclick();assert.equal(s.$('heading').textContent,'새 제목');assert.equal(s.$('list').children.length,2);
});
test('권한 대기 중 손을 떼면 녹음 시작 안 함; 충돌은 새로고침 요구',async()=>{
 const s=setup();await tick();s.$('reader').value='민수';
 const start=s.$('hold').listeners.pointerdown({preventDefault(){}});s.$('hold').listeners.pointerup();await start;assert.equal(s.$('review').hidden,true);assert.equal(s.released(),true);
 s.setConflict(true);s.$('text-input').value='새 제목\n새 절';s.$('erase-confirm').checked=true;await s.$('save-text').onclick();assert.match(s.$('st').textContent,/본문이 변경됨/);assert.equal(s.$('hold').disabled,true);assert.equal(s.$('refresh').disabled,false);
});
