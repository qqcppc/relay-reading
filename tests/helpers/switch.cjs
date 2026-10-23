// Feature switches reload immediately; click then assert the value in the loaded document.
async function switchFeature(page,selector,value){
 const toggle=page.locator(selector);if(await toggle.isChecked()===value)return;
 await Promise.all([page.waitForEvent('load'),toggle.click()]);
 await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.checked===value,{selector,value});
}
module.exports={switchFeature};
