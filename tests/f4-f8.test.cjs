const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function modules(flags={}){const context=vm.createContext({RelayFeatures:{enabled:name=>flags[name]===true}});for(const file of ['f4-continuation.js','f7-quality.js','f8-import.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);return context;}
const plain=value=>JSON.parse(JSON.stringify(value));
test('F4: OFF, empty-verse order, assignment filtering and cancellation',()=>{
 const flags={};const c=modules(flags);assert.equal(c.RelayF4.enabled(),false);flags.F4=true;assert.equal(c.RelayF4.enabled(),true);
 assert.equal(c.RelayF4.next(0,5,i=>i===1,'민수'),2);
 c.RelayF5={enabled:()=>true,owner:verse=>verse===4?'민수':'지수'};assert.equal(c.RelayF4.next(0,5,()=>false,'민수'),3);assert.equal(c.RelayF4.next(3,5,()=>false,'민수'),-1);
 const ticket=c.RelayF4.ticket();c.RelayF4.cancel();assert.equal(c.RelayF4.current(ticket),false);
});
test('F7: short duration, silence, quiet speech and usable signal',()=>{
 const q=modules().RelayF7;assert.deepEqual(plain(q.measure([new Float32Array(1000)],.4)),['short','silent']);
 assert.deepEqual(plain(q.measure([new Float32Array(1000).fill(.001)],1)),['silent']);
 assert.deepEqual(plain(q.measure([new Float32Array(1000).fill(.01)],1)),['quiet']);
 assert.deepEqual(plain(q.measure([new Float32Array(1000).fill(.1)],1)),[]);
});
test('F8: supported numeric references, books and continuous chapter boundaries',()=>{
 const p=modules().RelayF8.parse;
 const text=p('창 1:1 첫 절\n창 1:2 둘째 절\n창 2:1 다음 장\n출 1:1 다른 책','교재');
 assert.deepEqual(plain(text.books),[{title:'창세기',startChapter:0},{title:'출애굽기',startChapter:2}]);assert.deepEqual(plain(text.pageStarts),[0,2,3]);assert.equal(text.verses.length,4);
 assert.deepEqual(plain(p('1 하나\n2 둘').verses),['하나','둘']);assert.deepEqual(plain(p('1\n하나\n\n2\n둘').verses),['하나','둘']);
 assert.deepEqual(plain(p('창 1:1\n첫 절\n1:2\n다음 절').verses),['첫 절','다음 절']);
 assert.equal(p('1:16 시작\n1:17 다음').chapters[0].startVerse,16);
 assert.deepEqual(plain(p('# 첫 책\n@1장 | 1\n첫 문단\n\n둘째 문단\n\n---\n\n@2장 | 1\n다음 장').pageStarts),[0,2]);
});
test('F8: malformed/gapped input is rejected, plain text remains literal',()=>{
 const p=modules().RelayF8.parse;assert.throws(()=>p('1:1 하나\n1:3 셋'));assert.throws(()=>p('1 하나\n1 중복'));assert.throws(()=>p('1'));assert.throws(()=>p(''));
 assert.throws(()=>p('1 첫 절\n# 빈 책'));assert.equal(p('<img src=x onerror=alert(1)>').verses[0],'<img src=x onerror=alert(1)>');
});
