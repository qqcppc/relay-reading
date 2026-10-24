const {createHash}=require('node:crypto');
// Explicit creator fixture. Request routes still forward the real caller's credentials unchanged.
async function seedAdmin(ctx,api){const scope=createHash('sha256').update(JSON.stringify({url:api,key:'test-key'})).digest('hex');await ctx.addInitScript(({scope,api})=>{try{if(!sessionStorage.getItem('admin-seed')){localStorage.setItem('relay.connection.v1',JSON.stringify({url:api,key:'test-key'}));localStorage.setItem('relay.admin.v1',JSON.stringify({scope,key:'test-admin'}));sessionStorage.setItem('admin-seed','1');sessionStorage.setItem('relay.adminMode','1');}}catch(_){}},{scope,api});}
module.exports={seedAdmin};
