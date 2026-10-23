const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://relay.test/**',route=>route.fulfill({contentType:/\.js$/.test(route.request().url())?'application/javascript':'text/html',body:fs.readFileSync(route.request().url().endsWith('storage.js')?'storage.js':route.request().url().endsWith('ui.js')?'ui.js':'index.html','utf8')}));
 await page.route('https://script.google.com/**',route=>{
 const req=JSON.parse(route.request().postData());assert.equal(req.key,'test-key');
 return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data:req.action==='getText'?{title:'공유 제목',verses:['공유 절'],revision:'r1'}:{revision:'r1',recordings:[{verse:1,readerName:'민수'}]}})});
 });
 await page.goto('https://relay.test/index.html');
 assert.equal(await page.locator('.line').count(),4);
 await page.locator('#reader').fill('영희');await page.locator('#identity button').click();
 await page.reload();assert.equal(await page.locator('#reader').inputValue(),'영희');
 await page.goto('https://relay.test/index.html#'+new URLSearchParams({url:'https://script.google.com/macros/s/test/exec',key:'test-key'}));
 await page.waitForFunction(()=>document.querySelector('#heading').textContent==='공유 제목' && !document.querySelector('#save-text').disabled);
 assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#stop-record').isVisible(),false);
 assert.match(await page.locator('.tag').textContent(),/민수/);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#heading').textContent==='공유 제목' && !document.querySelector('#save-text').disabled);
 await page.locator('#disconnect').click();await page.waitForFunction(()=>document.querySelectorAll('.line').length===4);
 assert.equal(await page.locator('#stop-record').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS: trial, name persistence, shared reads, fragment clearing, reload, disconnect');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
