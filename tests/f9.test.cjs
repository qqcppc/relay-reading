const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function modules(flags={}){const c=vm.createContext({RelayFeatures:{enabled:name=>flags[name]===true}});for(const file of ['f9-groups.js','f8-import.js','f4-continuation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);return c;}
const plain=value=>JSON.parse(JSON.stringify(value));
test('F9 defaults OFF, validates non-overlapping same-chapter ranges and maps unit starts',()=>{
 const flags={};const c=modules(flags),text={verses:['a','b','c','d'],pageStarts:[0,3]};c.RelayF9.set([{start:1,end:2}],text);
 assert.deepEqual(plain(c.RelayF9.unit(1)),{start:1,end:1});flags.F9=true;assert.deepEqual(plain(c.RelayF9.unit(1)),{start:0,end:1});
 for(const groups of [[{start:1,end:1}],[{start:1,end:4}],[{start:1,end:2},{start:2,end:3}],[{start:0,end:2}]])assert.throws(()=>c.RelayF9.validate(groups,text));
 assert.equal(c.RelayF9.changed({verse:1,endVerse:2},[{start:1,end:2}]),false);assert.equal(c.RelayF9.changed({verse:1,endVerse:2},[]),true);
});
test('F9 F8 marker import and F4 skip group interiors',()=>{
 const c=modules({F9:true,F8:true,F4:true});const text=c.RelayF8.parse('# 창세기\n@1장 | 3\n| 3-5\n3 셋\n4 넷\n5 다섯\n6 여섯');assert.deepEqual(plain(text.groups),[{start:1,end:3}]);
 c.RelayF9.set(text.groups,text);assert.equal(c.RelayF4.next(0,4,()=>false,'나'),3);
 assert.throws(()=>c.RelayF8.parse('# 창세기\n| 1-3\n1 a\n2 b'));
 assert.throws(()=>c.RelayF8.parse('# 창세기\n| 1-2\n| 2-3\n1 a\n2 b\n3 c'));
});
