const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(responses=[]){
 const values=new Map(), calls=[];
 const ctx=vm.createContext({URL,URLSearchParams,AbortController,setTimeout,clearTimeout,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetch:async(url,opts)=>{calls.push({url,...opts});return {ok:true,json:async()=>responses.shift()}}});
 vm.runInContext(fs.readFileSync('storage.js','utf8'),ctx);
 return {api:ctx.RelayStorage,values,calls};
}
function connect(api){const history={replaceState(...args){this.args=args}};api.acceptLink({hash:'#'+new URLSearchParams({url:'https://script.google.com/macros/s/test/exec',key:'private-key'}),pathname:'/index.html',search:''},history);return history;}
test('link credentials persist, fragment clears, name persists, unsafe URLs rejected',()=>{
 const {api,values}=setup();assert.equal(api.connected,false);
 assert.equal(connect(api).args[2],'/index.html');assert.equal(api.connected,true);
 assert.equal(JSON.parse(values.get('relay.connection.v1')).key,'private-key');
 api.setReaderName(' 민수 ');assert.equal(api.readerName,'민수');
 assert.throws(()=>api.acceptLink({hash:'#url=https://evil.example/exec&key=x',pathname:'/',search:''},{replaceState(){}}));
 api.disconnect();assert.equal(api.connected,false);
});
test('POST contract, revision retry, and API authentication error',async()=>{
 const ok=data=>({ok:true,data});
 const {api,calls}=setup([ok({title:'old',verses:['a'],revision:'1'}),ok({revision:'2',recordings:[]}),ok({title:'new',verses:['b'],revision:'2'}),ok({revision:'2',recordings:[]}),{ok:false,error:{code:'UNAUTHORIZED',message:'공유키 오류'}}]);
 connect(api);assert.equal((await api.load()).text.title,'new');assert.equal(calls.length,4);
 assert.equal(calls[0].method,'POST');assert.equal(calls[0].headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(JSON.parse(calls[0].body).key,'private-key');
 await assert.rejects(api.request('getText'),{code:'UNAUTHORIZED'});
});
