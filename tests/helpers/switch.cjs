// Feature switches reload immediately and reopen settings (#50); click then assert the value in the loaded document.
async function switchFeature(page,selector,value){
 const toggle=page.locator(selector);if(await toggle.isChecked()===value)return;
 await Promise.all([page.waitForEvent('load'),toggle.click()]);
 await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.checked===value,{selector,value});
 await page.waitForFunction(()=>document.querySelector('#settings')?.open,null,{timeout:3000}).catch(()=>{});await page.evaluate(()=>document.querySelector('#settings')?.close());
}
module.exports={switchFeature};
