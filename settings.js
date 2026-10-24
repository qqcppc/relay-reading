/* Device preferences only; version choice intentionally does not replace text. */
(function () {
  'use strict';
  const key = 'relay.settings.v1';
  const choices = {theme:['system','light','dark'], font:['system','serif','sans'], version:['1','2','3']};
  const fonts = {
    system:'system-ui, sans-serif',
    serif:'"Noto Serif KR", "Batang", "바탕", serif',
    sans:'"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  };
  const preferences = {theme:'system',font:'system',version:'1'};
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    for (const name of Object.keys(choices)) if (choices[name].includes(saved?.[name])) preferences[name] = saved[name];
  } catch (_) { /* Invalid/unavailable storage falls back to device defaults. */ }
  const limits={bookColumns:[1,5,1,4],verseColumns:[1,5,1,1],book:[.8,1.6,.05,1.15],chapter:[2,4.5,.1,3],verse:[.45,1.2,.05,.5625],body:[.9,2,.1,1.15]};
  const sizes=Object.fromEntries(Object.entries(limits).map(([name,range])=>[name,range[3]]));let target='body',preview=null;
  try{const saved=JSON.parse(localStorage.getItem('relay.sizes.v1')||'null');if(saved){for(const [name,[min,max,step]]of Object.entries(limits)){const n=saved[name];if(typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max&&(step!==1||Number.isInteger(n)))sizes[name]=n;}}else{for(const [name,key]of [['body','relay.font'],['book','relay.hfont']]){const n=Number(localStorage.getItem(key)),[min,max]=limits[name];if(Number.isFinite(n)&&n>=min&&n<=max)sizes[name]=n;}}const old=Number(localStorage.getItem('relay.bfont'));if(old>=.7&&old<=1.3)document.documentElement.style.setProperty('--bfs',old+'rem');}catch(_){}
  function applySizes(){const style=document.documentElement.style;for(const [name,css]of Object.entries({book:'--hfs',chapter:'--chapter-fs',verse:'--verse-fs',body:'--fs'}))style.setProperty(css,sizes[name]+'rem');style.setProperty('--book-columns',sizes.bookColumns);style.setProperty('--verse-columns',sizes.verseColumns);}
  applySizes();
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  function apply() {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme === 'system' ? (scheme?.matches ? 'dark' : 'light') : preferences.theme;
    root.dataset.textVersion = preferences.version;
    root.style.setProperty('--reading-font', fonts[preferences.font]);
  }
  apply();
  scheme?.addEventListener?.('change', () => { if (preferences.theme === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const $=id=>document.getElementById(id);
    function drawSize(){const columns=target.endsWith('Columns'),value=sizes[target],[min,max]=limits[target];for(const button of document.querySelectorAll('[data-size-target]'))button.setAttribute('aria-pressed',String(button.dataset.sizeTarget===target));$('size-down').textContent=columns?'한 칸 적게':'작게';$('size-up').textContent=columns?'한 칸 많게':'크게';$('size-down').disabled=value<=min;$('size-up').disabled=value>=max;$('size-value').textContent=columns?'한 줄 '+value+'개':Math.round(value*16)+'px';const box=$('size-preview');box.replaceChildren();if(columns){const grid=document.createElement('div');grid.className='preview-grid';grid.style.setProperty('--preview-columns',value);for(let i=0;i<value;i++){const cell=document.createElement('span');cell.textContent=target==='bookColumns'?['창세기','출애굽기','레위기','민수기','신명기'][i]:String(i+1);grid.append(cell);}box.append(grid);}else{const sample=document.createElement('span');sample.style.fontSize=value+'rem';sample.style.fontFamily=target==='body'?fonts[preferences.font]:'inherit';sample.style.fontWeight=target==='body'?'400':target==='verse'?'700':'800';sample.textContent=target==='book'?$('version')?.textContent||'책':target==='chapter'?$('tb-ch')?.textContent||'1':target==='verse'?'12':'본문 미리보기';box.append(sample);}}
    preview=drawSize;for(const button of document.querySelectorAll('[data-size-target]'))button.onclick=()=>{target=button.dataset.sizeTarget;drawSize();};
    function changeSize(direction){const [min,max,step]=limits[target];sizes[target]=Math.max(min,Math.min(max,Number((sizes[target]+direction*step).toFixed(4))));applySizes();drawSize();try{localStorage.setItem('relay.sizes.v1',JSON.stringify(sizes));}catch(_){} }
    $('size-down').onclick=()=>changeSize(-1);$('size-up').onclick=()=>changeSize(1);drawSize();
    for (const name of Object.keys(choices)) {
      const buttons = document.querySelectorAll(`[data-${name}-choice]`);
      const update = () => buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset[name + 'Choice'] === preferences[name])));
      buttons.forEach(button => button.addEventListener('click', () => {
        const value = button.dataset[name + 'Choice'];
        if (!choices[name].includes(value)) return;
        preferences[name] = value; apply(); update();preview?.();
        try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) { /* Current session remains usable. */ }
      }));
      update();
    }
  });
})();
