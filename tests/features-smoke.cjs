/* Browser integration: real local shell/SW + shared Apps Script service mocks. No voice files written. */
const {chromium}=require('playwright');
const {server}=require('./helpers/apps-script.cjs');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const backend=server(), apiUrl='https://script.google.com/macros/s/test/exec';
 backend.call({action:'saveText',revision:'0',title:'공유 본문',verses:['공유 첫 줄','공유 둘째 줄']});
 const web=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://local').pathname.slice(1)||'index.html';
  if(file.includes('..')){res.writeHead(404).end();return;}
  try{const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'})[ext]||'text/html');res.end(fs.readFileSync(path.join(process.cwd(),file)));}catch(_){res.writeHead(404).end();}
 });
 await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+web.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const errors=[];let calls=0;
 async function context(saved){const ctx=await browser.newContext({viewport:{width:390,height:700}});await ctx.route('https://script.google.com/**',route=>{if(ctx.offlineForTest)return route.abort();calls++;return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(backend.call(JSON.parse(route.request().postData())))});});if(saved)await ctx.addInitScript(data=>{if(!sessionStorage.getItem('seeded')){for(const [key,value]of Object.entries(data))localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem('seeded','1');}},saved);return ctx;}
 async function reloadSwitch(page,id,value){await page.locator('#settings-open').click();await Promise.all([page.waitForEvent('load'),page.locator(id).setChecked(value)]);}
 async function record(page){await page.locator('.card-trigger').first().focus();await page.keyboard.press('r');await page.waitForSelector('.line.recording');}
 try{
  const c1=await context();const p1=await c1.newPage();p1.on('pageerror',e=>errors.push(e.message));await p1.goto(origin);
  const demo=await p1.locator('.t').allTextContents(),badges=await p1.locator('[data-n]').count();
  await p1.locator('#settings-open').click();for(const id of ['#feature-f1','#feature-f2','#feature-f3'])assert.equal(await p1.locator(id).isChecked(),false);
  assert.equal(await p1.locator('#f1-connection').isVisible(),false);assert.equal(await p1.locator('link[rel=manifest]').count(),0);assert.equal(calls,0);
  await Promise.all([p1.waitForEvent('load'),p1.locator('#feature-f1').check()]);await p1.locator('#settings-open').click();
  await p1.locator('#f1-url').fill(apiUrl);await p1.locator('#f1-key').fill('test-key');await Promise.all([p1.waitForEvent('load'),p1.locator('#f1-connect').click()]);await p1.waitForFunction(()=>document.querySelector('.t')?.textContent==='공유 첫 줄');
  assert.deepEqual(await p1.locator('.t').allTextContents(),['공유 첫 줄','공유 둘째 줄']);assert.equal(await p1.locator('[data-n]').count(),badges);
  backend.props.F2_ENABLED='true';await reloadSwitch(p1,'#feature-f2',true);await p1.waitForFunction(()=>revision!==null);await p1.locator('#people-open').click();assert.equal(await p1.locator('#people-list li').count(),0);await p1.locator('#reader').fill('민수');await p1.locator('#reader').dispatchEvent('change');await p1.locator('#people .dlg-close').click();
  const c2=await context({'relay.features.v1':{F1:true,F2:true,F3:false},'relay.connection.v1':{url:apiUrl,key:'test-key'}});const p2=await c2.newPage();p2.on('pageerror',e=>errors.push(e.message));await p2.goto(origin);await p2.waitForFunction(()=>revision!==null);await p2.locator('#people-open').click();await p2.locator('#reader').fill('지수');await p2.locator('#reader').dispatchEvent('change');await p2.locator('#people .dlg-close').click();
  await record(p1);await p2.evaluate(()=>RelayF2.refresh());assert.equal(await p2.locator('.f2-locked').count(),1);await p2.locator('.card-trigger').first().focus();await p2.keyboard.press('r');assert.match(await p2.locator('#st').textContent(),/읽는 중/);
  await p1.locator('.line.recording .card-trigger').click();await p1.waitForSelector('.line #review',{state:'visible'});await p1.locator('#ok').click();await p1.waitForSelector('#review',{state:'hidden'});
  await p2.evaluate(()=>loadShared());await p2.locator('.card-trigger').first().focus();await p2.keyboard.press('r');assert.match(await p2.locator('#st').textContent(),/녹음한 이름/);
  await reloadSwitch(p1,'#feature-f3',true);await p1.evaluate(()=>navigator.serviceWorker.ready);await p1.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await p1.locator('link[rel=manifest]').count(),1);
  await p1.evaluate(()=>Object.defineProperty(navigator,'share',{value:async data=>{window.sharedInvite=data},configurable:true}));const cacheUrls=await p1.evaluate(async()=>{const urls=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())urls.push(request.url);return urls;});assert(cacheUrls.every(url=>!url.includes('script.google.com')&&!url.includes('key=')));await p1.locator('#people-open').click();await p1.locator('#f3-invite').click();const invite=await p1.evaluate(()=>window.sharedInvite.url);const parsed=new URL(invite);assert.equal(parsed.search,'');assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('key'),'test-key');
  await p1.evaluate(()=>{Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedInvite=value}},configurable:true});});await p1.locator('#f3-invite').click();assert.equal(await p1.evaluate(()=>window.copiedInvite),invite);await p1.locator('#people .dlg-close').click();
  c1.offlineForTest=true;await c1.setOffline(true);await p1.reload();await p1.waitForFunction(()=>document.querySelector('#feature-f3').checked);assert.equal(await p1.locator('#top').count(),1);await p1.waitForFunction(()=>document.querySelector('#st').textContent.includes('연결 실패'));c1.offlineForTest=false;await c1.setOffline(false);await p1.reload();await p1.waitForFunction(()=>revision!==null);
  await reloadSwitch(p1,'#feature-f3',false);assert.equal(await p1.locator('link[rel=manifest]').count(),0);assert.equal((await p1.evaluate(()=>navigator.serviceWorker.getRegistrations())).length,0);assert.equal((await p1.evaluate(()=>caches.keys())).length,0);
  await reloadSwitch(p1,'#feature-f2',false);await reloadSwitch(p1,'#feature-f1',false);assert.deepEqual(await p1.locator('.t').allTextContents(),demo);assert.equal(await p1.locator('[data-n]').count(),badges);assert.equal(await p1.locator('#f3-invite').isVisible(),false);
  const c3=await context();await c3.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});const p3=await c3.newPage();p3.on('pageerror',e=>errors.push(e.message));await p3.goto(origin);await p3.locator('#settings-open').click();await p3.locator('#feature-f1').click();assert.equal(await p3.locator('#feature-f1').isChecked(),false);assert.match(await p3.locator('#feature-status').textContent(),/저장 설정/);assert.deepEqual(errors,[]);console.log('PASS: default OFF baseline, F1 real-mode setup, two-phone F2 lock/ownership, F3 SW/offline/share/copy/removal, OFF baseline restored');
 }finally{await browser.close();await new Promise(resolve=>web.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
