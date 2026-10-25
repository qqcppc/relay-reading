/* Device preferences only; version choice intentionally does not replace text. */
(function (root) {
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
  const limits={book:[.8,1.6,.05,1.15],chapter:[2,4.5,.1,3],verse:[.6,1.4,.05,.9],body:[.9,2,.1,1.15]};
  const sizes=Object.fromEntries(Object.entries(limits).map(([name,range])=>[name,range[3]]));let target='body',preview=null;
  try{const saved=JSON.parse(localStorage.getItem('relay.sizes.v1')||'null');if(saved){for(const [name,[min,max,step]]of Object.entries(limits)){const n=saved[name];if(typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max&&(step!==1||Number.isInteger(n)))sizes[name]=n;}}else{for(const [name,key]of [['body','relay.font'],['book','relay.hfont']]){const n=Number(localStorage.getItem(key)),[min,max]=limits[name];if(Number.isFinite(n)&&n>=min&&n<=max)sizes[name]=n;}}const old=Number(localStorage.getItem('relay.bfont'));if(old>=.7&&old<=1.3)document.documentElement.style.setProperty('--bfs',old+'rem');}catch(_){}
  function applySizes(){const style=document.documentElement.style;for(const [name,css]of Object.entries({book:'--hfs',chapter:'--chapter-fs',verse:'--verse-fs',body:'--fs'}))style.setProperty(css,sizes[name]+'rem');style.setProperty('--book-columns',4);style.setProperty('--verse-columns',1);}
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
    const labels={book:'책제목',chapter:'장번호',verse:'절번호',body:'본문'};
    function verseLimit(){const cell=$('progress')?.querySelector('.seg'),rect=root.RelayNavigator?.metrics()||cell?.getBoundingClientRect();if(!rect?.width||!rect?.height)return limits.verse[1];const sample=document.createElement('canvas').getContext('2d'),rootSize=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;sample.font='700 100px system-ui';const number=String(Math.max(20,rect.number||root.RelayFrame?.verseCount?.()||99)),width=sample.measureText(number).width/100;return Math.max(.3,Math.min(1.2,(rect.height-3)/rootSize,(rect.width-3)/width/rootSize));}
    function drawSize(){const value=sizes[target],[min]=limits[target],max=target==='verse'?verseLimit():limits[target][1];for(const button of document.querySelectorAll('[data-size-target]'))button.setAttribute('aria-pressed',String(button.dataset.sizeTarget===target));$('size-down').disabled=value<=min;$('size-up').disabled=value>=max-.001;$('size-value').textContent=labels[target]+' '+Math.round(value*16)+'px';$('size-target-toggle').textContent=labels[target];const box=$('size-preview');box.style.fontSize=sizes.body+'rem';box.style.fontFamily=fonts[preferences.font];box.textContent=root.RelayFrame?.preview?.()||'본문 미리보기\n읽는 크기와 글꼴\n화면에서 바로 확인';document.documentElement.dataset.preview=target;}
    preview=drawSize;root.RelayPreferences={version:()=>({'1':'개역개정','2':'새번역','3':'NIV'}[preferences.version]),refresh:drawSize,verseCount:verseLimit};
    $('size-target-toggle').onclick=()=>{$('size-target-toggle').hidden=true;$('size-targets').hidden=false;$('size-target-toggle').setAttribute('aria-expanded','true');};for(const button of document.querySelectorAll('[data-size-target]'))button.onclick=()=>{target=button.dataset.sizeTarget;$('size-targets').hidden=true;$('size-target-toggle').hidden=false;$('size-target-toggle').setAttribute('aria-expanded','false');drawSize();};
    function changeSize(direction){const [min,cap,step]=limits[target],max=target==='verse'?verseLimit():cap;sizes[target]=Math.max(Math.min(min,max),Math.min(max,Number((sizes[target]+direction*step).toFixed(4))));applySizes();drawSize();try{localStorage.setItem('relay.sizes.v1',JSON.stringify(sizes));}catch(_){} }
    $('size-down').onclick=()=>changeSize(-1);$('size-up').onclick=()=>changeSize(1);drawSize();
    for(const [name,id,labels]of [['theme','theme-cycle',{system:'폰',light:'밝게',dark:'어둡게'}],['font','font-cycle',{system:'기본',serif:'명조',sans:'고딕'}]]){const button=$(id);button.textContent=labels[preferences[name]];button.onclick=()=>{const list=choices[name];preferences[name]=list[(list.indexOf(preferences[name])+1)%list.length];button.textContent=labels[preferences[name]];apply();drawSize();try{localStorage.setItem(key,JSON.stringify(preferences));}catch(_){} };}
    for (const name of Object.keys(choices)) {
      const buttons = document.querySelectorAll(`[data-${name}-choice]`);
      const update = () => buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset[name + 'Choice'] === preferences[name])));
      buttons.forEach(button => button.addEventListener('click', () => {
        const value = button.dataset[name + 'Choice'];
        if (!choices[name].includes(value)) return;
        preferences[name] = value; apply(); update();preview?.();if(name==='version'){$('version-open').textContent=root.RelayPreferences.version();$('version-view').close();}
        try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) { /* Current session remains usable. */ }
      }));
      update();
    }
    $('version-open').textContent=root.RelayPreferences.version();
    const clampVerse=()=>{const max=verseLimit();if(sizes.verse>max){sizes.verse=max;applySizes();}drawSize();};root.addEventListener('resize',clampVerse);clampVerse();
  });
})(globalThis);
