const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage({viewport:{width:390,height:700},colorScheme:'dark'});
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://relay.test/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      return route.fulfill({contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path,'utf8')});
    });
    await page.goto('https://relay.test/');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    const text=await page.locator('.t').allTextContents();
    const badges=await page.locator('[data-n]').count();
    const palette=await page.evaluate(()=>PALETTE.join(','));
    await page.evaluate(()=>openSheet('settings'));
    assert.equal(await page.locator('[data-theme-choice="system"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-theme-choice="light"]').click();
    const light=await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.locator('[data-theme-choice="dark"]').click();
    assert.notEqual(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),light);
    await page.locator('[data-font-choice="serif"]').click();
    assert.match(await page.locator('.t').first().evaluate(e=>getComputedStyle(e).fontFamily),/Batang/);
    await page.locator('[data-version-choice="3"]').click();
    await page.reload(); await page.evaluate(()=>openSheet('settings'));
    for(const [name,value] of [['theme','dark'],['font','serif'],['version','3']]) assert.equal(await page.locator(`[data-${name}-choice="${value}"]`).getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.locator('.t').allTextContents(),text);
    await page.locator('[data-font-choice="sans"]').click();
    assert.match(await page.locator('.t').first().evaluate(e=>getComputedStyle(e).fontFamily),/Malgun Gothic/);
    await page.locator('[data-theme-choice="system"]').click();
    await page.emulateMedia({colorScheme:'light'}); await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.emulateMedia({colorScheme:'dark'}); await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    assert.equal(await page.locator('[data-n]').count(),badges);
    assert.equal(await page.evaluate(()=>PALETTE.join(',')),palette);
    const bounds=await page.locator('#settings').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height<=740);
    await page.addInitScript(() => {
      Storage.prototype.getItem=()=>{throw new Error('blocked')};
      Storage.prototype.setItem=()=>{throw new Error('blocked')};
    });
    await page.reload(); await page.evaluate(()=>openSheet('settings'));
    await page.locator('[data-theme-choice="light"]').click();
    await page.locator('[data-font-choice="serif"]').click();
    await page.locator('[data-version-choice="2"]').click();
    assert.equal(await page.locator('html').getAttribute('data-text-version'),'2');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.deepEqual(errors,[]);
    console.log('PASS: device theme, overrides, font/version persistence, unchanged text/palette/badges, blocked storage, mobile layout');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
