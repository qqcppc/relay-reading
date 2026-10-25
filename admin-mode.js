/* The current user always sees editing tools; no administrator mode switch or password form. */
(function(root){'use strict';const $=id=>document.getElementById(id);let context=null;
 function paint(){if(!context)return;$('admin-area').hidden=false;$('admin-tools').hidden=false;$('admin-build').textContent=$('settings-open').textContent;root.RelayFrame?.permissions();}
 root.RelayAdmin={paint,active:()=>true,open:()=>root.RelayFrame?.open('options'),init(next){context=next;$('settings-name').value=root.RelayStorage.readerName;$('settings-name-save').onclick=()=>{try{root.RelayStorage.setReaderName($('settings-name').value);context.name();$('settings-name-status').textContent='이름 저장됨';}catch(error){$('settings-name-status').textContent=error.message;}};paint();}};
})(globalThis);
