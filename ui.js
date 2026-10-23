'use strict';
const $ = id => document.getElementById(id);
const review = $('review');
const ANTHEM = ['동해 물과 백두산이 마르고 닳도록','하느님이 보우하사 우리나라 만세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세','남산 위에 저 소나무 철갑을 두른 듯','바람 서리 불변함은 우리 기상일세','가을 하늘 공활한데 높고 구름 없이','밝은 달은 우리 가슴 일편단심일세','이 기상과 이 맘으로 충성을 다하여','괴로우나 즐거우나 나라 사랑하세'];
const SAMPLE_COUNTS = [31,25,24,26,32,22,24,22,29,32, 22,25];
const SAMPLE_TOTAL = SAMPLE_COUNTS.reduce((a, b) => a + b, 0);
let lines = Array.from({length: SAMPLE_TOTAL}, (_, i) => ANTHEM[i % 10] + ' ' + ANTHEM[(i + 3) % 10] + (i % 3 ? '' : ' ' + ANTHEM[(i + 6) % 10]));
let books = [{title:'창세기',startChapter:0},{title:'출애굽기',startChapter:10}];
let chapters = SAMPLE_COUNTS.map((_, c) => ({title: `${c < 10 ? c + 1 : c - 9}장`, startVerse: 1}));
let pageStarts = SAMPLE_COUNTS.map((_, c) => SAMPLE_COUNTS.slice(0, c).reduce((a, b) => a + b, 0)), page = 0, holdTimer = null, gesture = null, suppressClick = false;
let title = '애국가', revision = null, recordings = [], selected = 0;
let busy = false, ready = !RelayStorage.connected, acquiring = false;
let recorder = null, stream = null, draft = null, recordTarget = null;
let captureEpoch = 0;
let playbackId = 0, playbackUrl = null;
const local = new Map(), player = new Audio();
let playingIndex = -1;
function status(message) { $('st').textContent = message; }
function unitAt(index) {return globalThis.RelayF9?.unit(index) || {start:index,end:index};}
function recordingAt(index) {
  if(RelayStorage.connected)return recordings.find(r=>r.verse<=index+1&&(r.endVerse??r.verse)>=index+1);
  for(const [key,item]of local)if(key<=index&&(item.endVerse??key+1)>=index+1)return {...item,verse:key+1};
}
function hasAudio(index) {return !!recordingAt(index);}
function locked() { return busy || acquiring || !!recorder || !!draft; }
function controls() {
  document.body?.classList?.toggle('is-recording', !!recorder);
  $('book-open').disabled = locked() || !ready || !lines.length;
  $('prev-page').disabled = locked() || page === 0;
  $('next-page').disabled = locked() || page >= pageStarts.length - 1;
  ['all','refresh','save-text','disconnect'].forEach(id => { $(id).disabled = locked() || !ready && id !== 'refresh' && id !== 'disconnect'; });
  ['ok','listen','no'].forEach(id => { $(id).disabled = busy; });
  $('ok').disabled = busy || !!draft?.qualityChecking || !!draft?.trimChecking;
  $('text-input').disabled = locked();
  $('reader').disabled = busy || acquiring || !!recorder;
}
function render() {
  $('heading').textContent = title || '공유 본문 없음';
  if($('empty-text')){$('empty-text').hidden=!(RelayStorage.connected&&ready&&!lines.length);$('empty-import').disabled=locked()||!ready;}
  page = Math.max(0, Math.min(page, pageStarts.length - 1));
  $('book-open').textContent = `📖 ${bookAt(page).title} ▾`;
  const chapter = chapterAt(page);
  const endVerse = chapter.startVerse + (pageStarts[page + 1] ?? lines.length) - pageStarts[page] - 1;
  $('page-label').textContent = `${chapter.title} · ${chapter.startVerse}~${endVerse}절 ▾`; $('version').textContent = bookAt(page).title; $('tb-ch').textContent = lines.length?chapter.title.replace(/장$/, ''):''; $('tb-vs').textContent = `${chapter.startVerse}~${endVerse}절`;
  review.remove();
  $('list').replaceChildren();
  lines.forEach((text, i) => {
    const unit=unitAt(i);if(i!==unit.start)return;
    text=lines.slice(unit.start,unit.end+1).join('\n');
    if (i < pageStarts[page] || i >= (pageStarts[page + 1] ?? lines.length)) return;
    const row = document.createElement('div');row.setAttribute('data-verse',String(i+1));
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'card-trigger';
    row.className = 'line' + (i === selected ? ' sel' : '') + (hasAudio(i) ? ' done' : '') + (recorder && i === selected ? ' recording' : '');
    if(unit.end>unit.start)row.className+=' f9-unit';
    if(globalThis.RelayF9?.selected(i))row.className+=' f9-selected';
    if (globalThis.RelayF2?.blocked(i + 1)) row.className += ' f2-locked';
    if (otherRecording(i)) { row.className += ' other-rec'; row.style.setProperty?.('--oc', personColor(globalThis.RelayF2?.reader?.(i+1) || '?')); }
    row.style.textAlign = 'left'; row.style.width = '100%';
    const tag = document.createElement('span'); tag.className = 'tag';
    const item = recordingAt(i);
    tag.textContent = globalThis.RelayF2?.blocked(i + 1) ? '잠금' : item ? item.readerName : '';
    if (item) row.style.setProperty?.('--pc', personColor(item.readerName));
    const assigned=globalThis.RelayF5?.owner(i+1);
    if(assigned){row.className+=' f5-assigned'+(assigned===$('reader').value.trim()?' f5-mine':'');row.style.setProperty('--assignment-color',personColor(assigned));}
    const vn = document.createElement('span'); vn.className = 'vn'; vn.textContent = String(chapter.startVerse + i - pageStarts[page])+(unit.end>i?'–'+(chapter.startVerse+unit.end-pageStarts[page]):'');
    const side = document.createElement('span'); side.className = 'side'; side.append(vn, tag);
    const content = document.createElement('span'); content.className = 't'; content.textContent = text;
    trigger.setAttribute('aria-label', `${vn.textContent}절 ${text}${recorder && i === selected ? ' · 녹음 중, 누르면 정지' : ''}`);
    trigger.append(side, content); row.append(trigger);
    trigger.onclick = () => { if (suppressClick) { suppressClick = false; return; } if (recorder && i === selected) { stop(); return; } if (locked() || !ready || globalThis.RelayF9?.editing()) return; if (playingIndex === i) { stopPlayback(); status(''); return; } selected = i; followSelected(); if (hasAudio(i)) play(i); };
    wireCard(trigger, i);
    if (draft && draft.verse === i + 1) row.append(review);
    $('list').append(row);
  });
  if (!draft) { review.hidden = true; $('list').after(review); }
  if($('f7-warning')){const warning=globalThis.RelayF7?.enabled() && draft?.quality ? RelayF7.label(draft.quality) : ''; $('f7-warning').textContent='⚠';$('f7-warning').title=warning;$('f7-warning').setAttribute('aria-label',warning);$('f7-warning').onclick=()=>status(warning);$('f7-warning').hidden=!warning;}
  if($('f10-compare')){$('f10-compare').hidden=!draft || !globalThis.RelayF10?.enabled();$('f10-status').textContent=draft?.trimChecking?'무음 확인 중':draft?.trimMessage||'';for(const id of ['f10-original','f10-trimmed'])$(id).disabled=busy||!!draft?.trimChecking; $('f10-trimmed').hidden=!draft?.trimChanged;}
  globalThis.RelayF5?.paint();globalThis.RelayF9?.paint();
  drawProgress();globalThis.RelayF12?.paint();globalThis.RelayF13?.paint();
  const fromNo = chapter.startVerse + Math.max(0, selected - pageStarts[page]);
  if (!playbackUrl && $('center-txt')) $('center-txt').textContent = selected === pageStarts[page] ? '처음부터 듣기' : `${fromNo}절부터 듣기`;
  controls();globalThis.RelayF14?.paint();globalThis.RelayDrafts?.reveal();
}
let gridBand = 0, gridManual = false, gridSwiped = false;
function otherRecording(i) { return !!globalThis.RelayF2?.blocked(i + 1); }
function drawProgress() {
  const bar = $('progress'); if (!bar) return; bar.replaceChildren();
  const from = pageStarts[page], to = pageStarts[page + 1] ?? lines.length;
  let full = to>from; for (let i = from; i < to; i++) if (!hasAudio(i)) full = false;
  $('center').classList?.toggle?.('full', full); $('center-play').hidden = !full && !playbackUrl;
  const bands = Math.max(1, Math.ceil((to - from) / 20));
  if (selected >= from && selected < to && !gridManual) gridBand = Math.floor((selected - from) / 20);
  gridBand = Math.max(0, Math.min(gridBand, bands - 1)); gridManual = false;
  [['prev', gridBand > 0, '‹'], ['next', gridBand < bands - 1, '›']].forEach(([c, on, t]) => { if (!on) return; const a = document.createElement('span'); a.className = 'grid-arrow ' + c; a.textContent = t; bar.append(a); });
  for (let k = gridBand * 20; k < gridBand * 20 + 20; k++) {
    const m = k % 20, block = 0, r = Math.floor(m / 10), c = m % 10;
    const seg = document.createElement('button'); seg.type = 'button';
    seg.style.gridColumn = String(c + 1); seg.style.gridRow = String(r + 1);
    const i = from + k; seg.textContent = hasAudio(i) ? '' : String(k + 1);
    if (i >= to) { seg.className = 'seg off'; seg.disabled = true; seg.tabIndex = -1; bar.append(seg); continue; }
    seg.className = 'seg' + (hasAudio(i) ? ' done' : '') + (i >= unitAt(selected).start && i <= unitAt(selected).end ? ' cur' : '') + (otherRecording(i) ? ' other-rec' : '');
    const who = recordingAt(i); if (who) seg.style.setProperty?.('--pc', personColor(who.readerName));
    if(unitAt(i).end>unitAt(i).start)seg.className+=' f9-group';
    if(globalThis.RelayF11?.pending(i+1)){seg.className+=' f11-pending';seg.setAttribute('title','이 폰 업로드 대기');}
    const assigned=globalThis.RelayF5?.owner(i+1);if(assigned){seg.className+=' f5-assigned';seg.style.setProperty?.('--assignment-color',personColor(assigned));}
    seg.setAttribute('aria-label', `${k + 1}절${hasAudio(i) ? ' 녹음됨' : ''}`);
    seg.onclick = () => { if (gridSwiped) return; if (locked() || !ready) return; if(globalThis.RelayF5?.manual()){RelayF5.choose(i+1);return;} selected = unitAt(i).start; revealSelected(); };
    bar.append(seg);
  }
}
function pageFor(i) { return Math.max(0, pageStarts.findLastIndex(start => start <= i)); }
function followSelected() { selected=unitAt(selected).start; page = pageFor(selected); render(); }
function revealSelected() {
  followSelected();
  requestAnimationFrame(() => {
    (globalThis.RelayF9?.enabled()?$('list').querySelector(`[data-verse="${selected+1}"]`):$('list').children[selected - pageStarts[page]])?.scrollIntoView({behavior: 'instant', block: 'nearest'});
  });
}
function stopPlayback() {
  playingIndex = -1;
  playbackId++; player.pause(); player.onended = null; player.removeAttribute('src'); player.load();
  if (playbackUrl) URL.revokeObjectURL(playbackUrl); playbackUrl = null;
  $('all').textContent = '▶'; $('play-ic').textContent = '▶';
}
async function play(i, chain = false, sequence) {
  if (locked() || !ready) return;
  const recording=recordingAt(i);if(!recording)return;i=recording.verse-1;
  if (sequence === undefined) { stopPlayback(); sequence = playbackId; }
  try {
    status('');
    let blob;
    if (RelayStorage.connected) {
      const data = await RelayStorage.request('getAudio', {revision, verse: i + 1});
      blob = new Blob([Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))], {type: data.mimeType});
    } else blob = recording.blob;
    if (sequence !== playbackId || !blob) return;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(blob); player.src = playbackUrl; playingIndex = i; if (chain) { $('all').textContent = '■'; $('play-ic').textContent = '■'; }
    selected = i; followSelected();
    player.onended = () => {
      if (sequence !== playbackId) return;
      const next = lines.findIndex((_, k) => k > i && recordingAt(k)?.verse === k+1);
      if (chain && next >= 0) play(next, true, sequence); else { stopPlayback(); status(''); }
    };
    await player.play(); if (sequence === playbackId) status('');
  } catch (err) { if (sequence === playbackId) { stopPlayback(); await failure(err); } }
}
player.onerror = () => { stopPlayback(); status('음성 재생 실패. 절을 눌러 다시 시도'); };
async function refresh() {
  const snapshot = await RelayStorage.load();
  revision = snapshot.text.revision; title = snapshot.text.title; lines = snapshot.text.verses; pageStarts = snapshot.text.pageStarts || [0]; chapters = snapshot.text.chapters || []; books = snapshot.text.books || [{title: title.slice(0,80) || '본문',startChapter:0}];
  globalThis.RelayF9?.set(snapshot.text.groups || [],snapshot.text);
  recordings = snapshot.recordings;
  selected = lines.findIndex((_, i) => !hasAudio(i)); if (selected < 0) selected = 0;
  ready = true; $('connection').textContent = '공유 모드 · 녹음·본문을 그룹과 공유';
  page = pageFor(selected);
  if(globalThis.RelayDrafts)RelayDrafts.serverText(editorText());else $('text-input').value=editorText();
  await globalThis.RelayF2?.refresh();
  await globalThis.RelayF5?.refresh();
}
async function failure(err) {
  status('실패: ' + err.message);
  if (err.code === 'CONFLICT') {
    // Keep draft bound to its original revision; never silently upload to a new text.
    ready = false;
    status('본문이 변경됨. 임시 녹음은 취소 후 새로고침 필요');
  }
}
async function loadShared() {
  if (locked()) return;
  stopPlayback(); busy = true; controls();
  try { await refresh(); status(''); }
  catch (err) { ready = false; $('connection').textContent = '연결 실패: ' + err.message; status('공유 연결 실패. 새로고침 또는 F1 해제'); }
  finally { busy = false; render(); }
}
function discard() {
  clearComparison();
  $('au').pause(); $('au').removeAttribute('src'); $('au').load();
  $('au').pause(); if (draft) URL.revokeObjectURL(draft.url); globalThis.RelayF2?.release(); draft = null; $('review').hidden = true; controls();
}
async function start(event) {
  event.preventDefault();
  if (locked() || !ready || !lines.length) return;
  if (!$('reader').value.trim()) { status('먼저 읽는 사람 이름 입력'); $('reader').focus(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { status('HTTPS와 녹음을 지원하는 브라우저 필요'); return; }
  selected=unitAt(selected).start;
  const canonical=globalThis.RelayF9?.canonical(selected);
  if(canonical && canonical.end>canonical.start && !RelayF9.enabled()){status('묶음 녹음은 F9 켜기');return;}
  if(globalThis.RelayF11?.pending(selected+1)){status('이 절은 업로드 대기 중 · 설정에서 확인');return;}
  const item = recordingAt(selected);
  if (globalThis.RelayF2?.blocked(selected + 1)) { status('다른 폰에서 읽는 중'); return; }
  if (globalThis.RelayF2?.ownerBlocked(item, $('reader').value)) { status('녹음한 이름만 다시 녹음 가능'); return; }
  const epoch = ++captureEpoch;
  acquiring = true; stopPlayback(); controls();
  const target = {verse: selected + 1, endVerse:unitAt(selected).end+1, revision, readerName: $('reader').value.trim(),expectedPrevious:item?.playbackUrl||null};
  try {
    RelayStorage.setReaderName(target.readerName);
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
    if (epoch !== captureEpoch || document.hidden) { stream.getTracks().forEach(track => track.stop()); stream = null; return; }
    await globalThis.RelayF2?.acquire(target);
    if (epoch !== captureEpoch || document.hidden) { stream.getTracks().forEach(track => track.stop()); stream = null; globalThis.RelayF2?.release(); return; }
    const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('이 브라우저는 webm/ogg 녹음 미지원');
    const chunks = []; let total = 0, tooLarge = false;
    recorder = new MediaRecorder(stream, {mimeType: mime}); recordTarget = target;
    const current = recorder, startedAt = Date.now();
    current.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); total += e.data.size; if (total > 5 * 1024 * 1024) { tooLarge = true; stop(); } } };
    current.onstop = () => {
      stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null;
      const blob = new Blob(chunks, {type: current.mimeType});
      if (tooLarge || blob.size > 5 * 1024 * 1024 || !blob.size) { globalThis.RelayF2?.release(); status('녹음은 0바이트 초과 5MiB 이하만 가능. 다시 녹음'); }
      else { toast('녹음 완료'); draft = {...target, blob, url: URL.createObjectURL(blob)}; $('au').src = draft.url; $('review').hidden = false; status(globalThis.RelayF2 && !RelayF2.leaseValid() ? '잠금 만료. 취소 후 다시 녹음' : ''); }
      if(draft)prepareDraft(draft,(Date.now()-startedAt)/1000);
      render();
    };
    current.onerror = () => { status('녹음 장치 오류. 취소 후 다시 시도'); stop(); };
    current.start(250); render(); status(''); toast('녹음 시작');
  } catch (err) { stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null; globalThis.RelayF2?.release(); status('녹음 실패: ' + err.message); }
  finally { acquiring = false; controls(); }
}
async function prepareDraft(target,duration){
  if(globalThis.RelayF10?.enabled()){
    target.trimChecking=true;target.originalBlob=target.blob;
    try{const result=await RelayF10.trim(target.blob);if(draft!==target)return;
      target.trimChanged=result.changed;target.trimMessage=`${result.before.toFixed(1)}초 → ${result.after.toFixed(1)}초`+(result.changed?'':' · 원본 유지');
      if(result.changed){URL.revokeObjectURL(target.url);target.blob=result.blob;target.url=URL.createObjectURL(result.blob);$('au').src=target.url;duration=result.after;}
    }catch(error){if(draft===target)target.trimMessage=error.message+' · 원본 유지';}
    finally{target.trimChecking=false;}
  }
  if(draft!==target)return;
  if(globalThis.RelayF7?.enabled()){target.qualityChecking=true;render();try{target.quality=await RelayF7.analyze(target.blob,duration);}finally{target.qualityChecking=false;}}
  if(draft===target)render();
}
let comparisonUrl=null;
function clearComparison(){if(comparisonUrl)URL.revokeObjectURL(comparisonUrl);comparisonUrl=null;}
if($('f10-original'))$('f10-original').onclick=()=>{if(!draft||busy||draft.trimChecking)return;clearComparison();comparisonUrl=URL.createObjectURL(draft.originalBlob||draft.blob);$('au').src=comparisonUrl;$('au').play().catch(()=>status('음성 재생 실패'));};
if($('f10-trimmed'))$('f10-trimmed').onclick=()=>{if(!draft||busy||draft.trimChecking)return;clearComparison();$('au').src=draft.url;$('au').play().catch(()=>status('음성 재생 실패'));};
function stop() { globalThis.RelayF4?.cancel(); if (acquiring) captureEpoch++; if (recorder?.state === 'recording') recorder.stop(); }
function base64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('녹음 읽기 실패')); reader.readAsDataURL(blob); });
}
$('ok').onclick = async () => {
  if (!draft || busy || !ready || draft.qualityChecking || draft.trimChecking) return;
  busy = true; controls(); const pending = draft; let saved = false, autoNext = -1; const f4Ticket = globalThis.RelayF4?.ticket();
  try {
    if (RelayStorage.connected) {
      if(globalThis.RelayF11?.enabled()&&!pending.uploadId)pending.uploadId=crypto.randomUUID();
      const item = await RelayStorage.request('uploadRecording', {...globalThis.RelayF2?.uploadFields(), ...(pending.uploadId?{uploadId:pending.uploadId,expectedPrevious:pending.expectedPrevious}:{}), revision: pending.revision, verse: pending.verse, endVerse:pending.endVerse, readerName: pending.readerName, mimeType: pending.blob.type, audioBase64: await base64(pending.blob)});
      recordings = recordings.filter(r => r.verse !== item.verse).concat(item);
    } else local.set(pending.verse - 1, {blob: pending.blob, readerName: pending.readerName, endVerse:pending.endVerse});
    discard(); selected = lines.findIndex((_, i) => !hasAudio(i)); if (selected < 0) selected = pending.verse - 1;
    if (globalThis.RelayF4?.enabled()) {autoNext=RelayF4.next((pending.endVerse??pending.verse)-1,lines.length,index=>hasAudio(index)||!!globalThis.RelayF11?.pending(index+1),pending.readerName);if(autoNext>=0) selected=autoNext;}
    status(''); saved = true;
  } catch (err) {
    if(globalThis.RelayF11?.enabled() && pending.uploadId && RelayF11.retryable(err)){
      try{await RelayF11.enqueue(pending);discard();status('이 폰에 보관 · 연결되면 재전송');}
      catch(queueError){status(queueError.message+' · 임시 녹음 유지');}
    }else {await failure(err);if(ready)status('저장 확인 실패. 임시 녹음 유지 · 재시도하거나 취소 후 목록 새로고침');}
  }
  finally { busy = false; render(); if (saved) {revealSelected();if(autoNext>=0 && RelayF4.current(f4Ticket) && !document.hidden) await start({preventDefault(){}});} }
};
$('no').onclick = () => { if (!busy) { globalThis.RelayF4?.cancel(); discard(); const next = lines.findIndex((_, i) => !hasAudio(i)); if (next >= 0) selected = next; render(); revealSelected(); status(''); } };
$('save-text').onclick = async () => {
  if (locked() || !ready) return;
  if (!$('erase-confirm').checked) { status('기존 녹음 삭제 동의에 체크 필요'); return; }
  const input = $('text-input').value.replace(/\r\n?/g, '\n').trim();
  const newline = input.indexOf('\n');
  const nextTitle = (newline < 0 ? input : input.slice(0, newline)).trim();
  const parsed = parsePages(newline < 0 ? '' : input.slice(newline + 1), nextTitle);
  const verses = parsed.verses;
  if (parsed.books.some(b => !b.title || b.title.length > 80) || parsed.chapters.some(c => !c.title || c.title.length > 80 || !Number.isSafeInteger(c.startVerse) || c.startVerse > 1000000) || !nextTitle || nextTitle.length > 200 || !verses.length || verses.length > 500 || verses.some(v => !v || v.length > 10000) || JSON.stringify({title:nextTitle,verses}).length > 500000) { status('제목·절 형식/길이 확인 필요'); return; }
  try {await saveBody({title:nextTitle,verses,pageStarts:parsed.pageStarts,chapters:parsed.chapters,books:parsed.books});globalThis.RelayDrafts?.saved('editor');}
  catch (err) {await failure(err);}
};
function replaceBody(text) {
  globalThis.RelayF9?.set(text.groups || [],text);
  title=text.title;lines=text.verses;pageStarts=text.pageStarts || [0];chapters=text.chapters || [];books=text.books || [{title:title.slice(0,80),startChapter:0}];page=0;revision=text.revision;recordings=[];local.clear();selected=0;
}
async function saveBody(next) {
  if(locked() || !ready)throw Error('녹음 확인 또는 연결을 먼저 마쳐야 함');
  if(globalThis.RelayF8?.enabled())RelayF8.validate(next);
  busy=true;stopPlayback();globalThis.RelayF4?.cancel();controls();
  try {
    const text=RelayStorage.connected?await RelayStorage.request('saveText',{...next,revision}):next;
    globalThis.RelayF8?.remember(text);try{localStorage.removeItem('relay.groups.v1');}catch(_){}replaceBody(text);globalThis.RelayF5?.reset();
    if(globalThis.RelayDrafts)RelayDrafts.serverText(editorText());else $('text-input').value=editorText();$('erase-confirm').checked=false;$('editor').open=false;status('본문 저장 완료 · 기존 녹음 초기화');return text;
  } catch(error) {await failure(error);throw error;} finally {busy=false;render();}
}

function cancelGesture() { clearTimeout(holdTimer); holdTimer = null; gesture = null; }
function wireCard(row, i) {
  row.addEventListener('contextmenu', e => e.preventDefault());
  row.addEventListener('pointerdown', e => {
    if (recorder && i === selected) { suppressClick = false; return; }
    if (locked() || !ready || e.isPrimary === false || e.button > 0) return;
    suppressClick = false; cancelGesture();
    gesture = {x: e.clientX, y: e.clientY};
    holdTimer = setTimeout(() => {
      if (!gesture) return;
      suppressClick = true; cancelGesture(); selected = i;
      if(globalThis.RelayF9?.editing())RelayF9.select(i);else start({preventDefault() {}});
    }, 450);
  });
  row.addEventListener('pointermove', e => { if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12) cancelGesture(); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => row.addEventListener(type, cancelGesture));
  row.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r' && !locked() && ready) { e.preventDefault(); selected = i;if(globalThis.RelayF9?.editing())RelayF9.select(i);else start(e); } });
}
function changePage(next) { globalThis.RelayF4?.cancel();globalThis.RelayF9?.clear(); if (locked() || next < 0 || next >= pageStarts.length) return; cancelGesture(); stopPlayback(); page = next; selected = pageStarts[page]; render(); revealSelected(); }
$('prev-page').onclick = () => changePage(page - 1);
$('next-page').onclick = () => changePage(page + 1);
window.addEventListener('blur', () => { cancelGesture(); stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelGesture(); stop(); stopPlayback(); } });
function parseChapterPages(value) {
  const pages = value.trim().split(/\n[ \t]*---[ \t]*\n|\n[ \t]*\n[ \t]*\n+/);
  const verses = [], starts = [], meta = [];
  pages.forEach((part, index) => {
    part = part.trim();
    const header = part.match(/^@([^\n|]+)\|\s*([1-9][0-9]*)[ \t]*(?:\n|$)/);
    starts.push(verses.length);
    meta.push(header ? {title:header[1].trim(),startVerse:Number(header[2])} : {title:`${index + 1}장`,startVerse:verses.length + 1});
    if (header) part = part.slice(header[0].length).trim();
    verses.push(...part.split(/\n[ \t]*\n/).map(v => v.trim()));
  });
  return {verses, pageStarts: starts, chapters: meta};
}
function parsePages(value, defaultTitle = title) {
  const sections = value.trim().split(/(?:^|\n)[ \t]*#[ \t]+([^\n]+)[ \t]*(?:\n|$)/);
  if (sections.length === 1) return {...parseChapterPages(value), books:[{title:defaultTitle.slice(0,80) || '본문',startChapter:0}]};
  const result = {verses:[], pageStarts:[], chapters:[], books:[]};
  function addSection(name, content) {
    const parsed = parseChapterPages(content);
    result.books.push({title:name.trim(), startChapter:result.chapters.length});
    result.pageStarts.push(...parsed.pageStarts.map(start => start + result.verses.length));
    result.chapters.push(...parsed.chapters); result.verses.push(...parsed.verses);
  }
  if (sections[0].trim()) addSection(defaultTitle.slice(0,80) || '본문', sections[0]);
  for (let index = 1; index < sections.length; index += 2) addSection(sections[index], sections[index + 1]);
  return result;
}
function bookIndex(chapter) { return Math.max(0, books.findLastIndex(book => book.startChapter <= chapter)); }
function bookAt(chapter) { return books[bookIndex(chapter)] || {title:title.slice(0,80) || '본문',startChapter:0}; }
const BIBLE = [['창세기',50],['출애굽기',40],['레위기',27],['민수기',36],['신명기',34],['여호수아',24],['사사기',21],['룻기',4],['사무엘상',31],['사무엘하',24],['열왕기상',22],['열왕기하',25],['역대상',29],['역대하',36],['에스라',10],['느헤미야',13],['에스더',10],['욥기',42],['시편',150],['잠언',31],['전도서',12],['아가',8],['이사야',66],['예레미야',52],['예레미야애가',5],['에스겔',48],['다니엘',12],['호세아',14],['요엘',3],['아모스',9],['오바댜',1],['요나',4],['미가',7],['나훔',3],['하박국',3],['스바냐',3],['학개',2],['스가랴',14],['말라기',4],
['마태복음',28],['마가복음',16],['누가복음',24],['요한복음',21],['사도행전',28],['로마서',16],['고린도전서',16],['고린도후서',13],['갈라디아서',6],['에베소서',6],['빌립보서',4],['골로새서',4],['데살로니가전서',5],['데살로니가후서',3],['디모데전서',6],['디모데후서',4],['디도서',3],['빌레몬서',1],['히브리서',13],['야고보서',5],['베드로전서',5],['베드로후서',3],['요한일서',5],['요한이서',1],['요한삼서',1],['유다서',1],['요한계시록',22]];
function shortBook(label) {
  const m = label.match(/^(.+?)(상|하|전서|후서|일서|이서|삼서)$/);
  const known = ['사무엘','열왕기','역대','고린도','데살로니가','디모데','베드로','요한'];
  if (!m || !known.includes(m[1])) return [label, ''];
  const rn = {상:'Ⅰ',하:'Ⅱ',전서:'Ⅰ',후서:'Ⅱ',일서:'Ⅰ',이서:'Ⅱ',삼서:'Ⅲ'}[m[2]];
  return [m[1] === '요한' ? '요한서' : m[1], rn];
}
// Fill counts saved verses, including every member of F9 groups; demos and outbox are excluded.
function pickerProgress(from,to){
  let count=0;for(let index=from;index<to;index++){const item=recordingAt(index);if(item&&!item.demo&&(RelayStorage.connected||item.blob))count++;}
  return {count,total:Math.max(0,to-from)};
}
function fillPicker(button,from,to,label){
  const {count,total}=pickerProgress(from,to),percent=total?count/total*100:0;
  button.style.setProperty?.('--pct',percent.toFixed(2)+'%');
  if(total&&count===total)button.classList.add('ch-full');else if(count)button.classList.add('ch-part');
  button.setAttribute('aria-label',`${label} · 불러온 본문 ${count}/${total}절 녹음`);
  button.title=`불러온 본문 기준 ${count}/${total}절 · ${Math.round(percent)}%`;
}
function bookButton(label, index) {
  const button = document.createElement('button'); button.type = 'button'; const nt = BIBLE.findIndex(b => b[0] === label) >= 39; const [short, rn] = nt ? shortBook(label) : [label, '']; button.textContent = short;
  button.setAttribute('aria-label', label); if (rn) { const r = document.createElement('span'); r.className = 'rn'; r.textContent = rn; button.append?.(r); }
  if (index < 0) { button.className = 'empty'; button.onclick = () => showSampleChapters(label); }
  else { button.setAttribute('aria-current', String(index === bookIndex(page)));const first=books[index].startChapter,last=books[index+1]?.startChapter??pageStarts.length;fillPicker(button,pageStarts[first],pageStarts[last]??lines.length,label);button.onclick = () => showChapters(index); }
  return button;
}
let chPage = 0, chRender = null;
function pagedNumbers(total, make) {
  const items = $('picker-items'); items.replaceChildren(); items.className = 'chapters';
  const pages = Math.max(1, Math.ceil(total / 50)); chPage = Math.min(chPage, pages - 1);
  for (let k = chPage * 50; k < Math.min(total, chPage * 50 + 50); k++) items.append(make(k));
  const hint = $('picker-hint'); if (hint) { hint.hidden = pages < 2; hint.textContent = (chPage > 0 ? '‹ ' : '') + `${chPage * 50 + 1}–${Math.min(total, chPage * 50 + 50)}` + (chPage < pages - 1 ? ' ›' : ''); }
  chRender = next => { const n = chPage + next; if (n < 0 || n >= pages) return; chPage = n; pagedNumbers(total, make); };
  items.scrollTop = 0;
}
function showSampleChapters(name) {
  const count = (BIBLE.find(b => b[0] === name) || [name, 1])[1];
  $('picker-title').textContent = name + ' (준비 중)'; $('picker-back').hidden = false; $('picker-tabs').hidden = true;
  chPage = 0; pagedNumbers(count, k => { const button = document.createElement('button'); button.type = 'button'; button.textContent = String(k + 1); button.disabled = true; return button; });
}
let bookTab = 0;
try { bookTab = Number(localStorage.getItem('relay.bookTab')) || 0; } catch {}
let bookSide = 0;
try { bookSide = Number(localStorage.getItem('relay.bookSide')) || 0; } catch {}
function showBooks(flash) {
  $('picker-tabs').hidden = true;
  const known = new Set(BIBLE.map(b => b[0]));
  const extra = books.map((b, i) => [b, i]).filter(([b]) => !known.has(b.title));
  const items = $('picker-items'); items.replaceChildren(); items.className = 'books';
  const anyKnown = books.some(b => known.has(b.title));
  if (!anyKnown) { extra.forEach(([b, i]) => items.append(bookButton(b.title, i))); items.scrollTop = 0; return; }
  (bookSide === 0 ? BIBLE.slice(0, 39) : BIBLE.slice(39)).forEach(([t]) => items.append(bookButton(t, books.findIndex(b => b.title === t))));
  if (bookSide === 1) { extra.forEach(([b, i]) => items.append(bookButton(b.title, i))); items.append(sideButtons()); }
  const hint = $('picker-hint'); if (hint) { hint.hidden = false; hint.textContent = bookSide ? '‹ 구약' : '신약 ›'; }
  const f = $('picker-flash'); if (f) { f.textContent = ['구약', '신약', '기타'][bookSide]; f.style.opacity = flash ? '1' : '.55'; if (flash) setTimeout(() => { f.style.opacity = '.55'; }, 600); }
  items.scrollTop = 0;
}
function sideButtons() { const w = document.createElement('div'); w.className = 'side-btns'; [['people','온기목장'],['settings','설정']].forEach(([id, t]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => { $('book-picker').close(); openSheet(id); }; w.append(b); }); return w; }
function setBookSide(next) { if (next < 0 || next > 1 || next === bookSide) return; bookSide = next; try { localStorage.setItem('relay.bookSide', next); } catch {} showBooks(true); }
function showChapters(index) {
  const book = books[index]; $('picker-title').textContent = book.title; $('picker-back').hidden = false; $('picker-tabs').hidden = true;
  const end = books[index + 1]?.startChapter ?? pageStarts.length;
  chPage = Math.floor(Math.max(0, page - book.startChapter) / 50);
  pagedNumbers(end - book.startChapter, k => { const chapter = book.startChapter + k;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = globalThis.RelayF8?.enabled() ? (chapterAt(chapter).title.match(/^(\d+)장$/)?.[1] || String(chapter-book.startChapter+1)) : String(chapter-book.startChapter+1);
    button.setAttribute('aria-label', chapterAt(chapter).title); button.setAttribute('aria-current', String(chapter === page));
    fillPicker(button,pageStarts[chapter],pageStarts[chapter+1]??lines.length,chapterAt(chapter).title);
    button.onclick = () => { if (locked() || !ready) return; $('book-picker').close(); changePage(chapter); };
    return button; });
}
$('book-open').onclick = () => { if (locked() || !ready) return; showBooks(); $('book-picker').showModal(); };
$('picker-back').onclick = showBooks;
$('picker-close').onclick = () => $('book-picker').close();
function chapterAt(index) { return chapters[index] || {title:`${index + 1}장`, startVerse:pageStarts[index] + 1}; }
function editorText() {
  return title + '\n' + pageStarts.map((start, index) => {
    const book = books.find(item => item.startChapter === index);
    return (book ? `# ${book.title}\n` : '') + `@${chapterAt(index).title} | ${chapterAt(index).startVerse}\n` + lines.slice(start, pageStarts[index + 1] ?? lines.length).join('\n\n');
  }).join('\n\n---\n\n').replace(/\n\n---\n\n(?=# )/g, '\n\n');
}
$('all').onclick = () => { if (playbackUrl) { stopPlayback(); status(''); return; } const from = Math.max(0, selected); const first = lines.findIndex((_, i) => i >= from && hasAudio(i)); if (first >= 0) play(first, true); else status('아직 녹음 없음'); };
$('refresh').onclick = loadShared;
$('reader').value = RelayStorage.readerName;
$('identity').onsubmit = e => { e.preventDefault(); try { RelayStorage.setReaderName($('reader').value); status(''); } catch (err) { status(err.message); } };
$('disconnect').onclick = () => { if (locked()) return; try { RelayStorage.disconnect(); location.reload(); } catch (err) { status(err.message); } };
try { RelayStorage.acceptLink(location, history); } catch (err) { $('connection').textContent = err.message; }
ready = !RelayStorage.connected;
$('text-input').value = editorText();
if (RelayStorage.connected) { $('refresh').hidden = false; $('disconnect').hidden = false; loadShared(); }
render();

$('listen').onclick = () => { const a = $('au'); if (a.paused) { if(draft)a.src=draft.url; a.currentTime = 0; a.play().catch(() => status('미리듣기 실패. 다시 시도')); $('listen').textContent = '■ 멈춤'; } else { a.pause(); $('listen').textContent = '▶ 듣기'; } };
$('au').onended = $('au').onpause = () => { $('listen').textContent = '▶ 듣기'; };

$('tb-book').onclick = () => $('book-open').onclick();
$('tb-ch').onclick = () => { if (locked() || !ready || !lines.length) return; showChapters(bookIndex(page)); $('book-picker').showModal(); };
$('tb-vs').onclick = () => { if (locked() || !ready) return; showVerses(); $('book-picker').showModal(); };
function showVerses() {
  const chapter = chapterAt(page); $('picker-title').textContent = `${bookAt(page).title} ${chapter.title}`; $('picker-back').hidden = true; $('picker-tabs').hidden = true;
  const items = $('picker-items'); items.replaceChildren(); items.className = 'chapters';
  const from = pageStarts[page], to = pageStarts[page + 1] ?? lines.length;
  for (let i = from; i < to; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = String(chapter.startVerse + i - from);
    b.setAttribute('aria-current', String(i === selected)); if (hasAudio(i)) b.style.setProperty?.('box-shadow', 'inset 0 -4px 0 ' + personColor((RelayStorage.connected ? recordings.find(r => r.verse === i + 1) : local.get(i))?.readerName));
    b.onclick = () => { $('book-picker').close(); selected = i; revealSelected(); }; items.append(b);
  }
}
$('book-picker').addEventListener?.('close', () => document.body?.classList?.remove?.('modal-open'));
['book-picker','people','settings'].forEach(id => { const d = $(id); const open = d.showModal?.bind(d); if (open) d.showModal = () => { document.body?.classList?.add?.('modal-open'); open(); }; d.addEventListener?.('close', () => document.body?.classList?.remove?.('modal-open')); });
$('center-play').onclick = () => $('all').onclick();
$('reader').addEventListener('change', () => $('identity').onsubmit({preventDefault(){}}));
let swipeX = null;
$('list').addEventListener('touchstart', e => { swipeX = e.touches[0].clientX; }, {passive: true});
$('list').addEventListener('touchend', e => { if (swipeX === null || recorder || draft) return; const dx = e.changedTouches[0].clientX - swipeX; swipeX = null; if (Math.abs(dx) > 70) changePage(page + (dx < 0 ? 1 : -1)); });

let fontScale = 1.15;
try { fontScale = Math.max(.9, Math.min(2, Number(localStorage.getItem('relay.font')) || 1.15)); } catch {}
function applyFont() { document.documentElement?.style?.setProperty('--fs', fontScale + 'rem'); try { localStorage.setItem('relay.font', fontScale); } catch {} }
$('font-down').onclick = () => { fontScale = Math.max(.9, +(fontScale - .1).toFixed(2)); applyFont(); };
$('font-up').onclick = () => { fontScale = Math.min(2, +(fontScale + .1).toFixed(2)); applyFont(); };
applyFont();

$('edit-toggle').onclick = () => { $('editor').open = !$('editor').open; };

const PALETTE = ['#5f8f74','#8a7aa6','#b8925a','#5d8c9c','#b07a86','#7f8a5a','#9c7f6a','#6f7fa8','#a0884a'];
function personColor(name) {
  const me = ($('reader').value || RelayStorage.readerName || '').trim();
  if (name && name === me) return PALETTE[0];
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[1 + h % (PALETTE.length - 1)];
}
// 연출용 가상 녹음 (#22): 창세기 1~10장에 민지(많이)·도윤(조금) 녹음, 하늘 미참여. 실제 녹음본만 표시할 때 이 블록 삭제
const DEMO_PEOPLE = ['민지', '도윤', '하늘'];
if (!RelayStorage.connected) {
  const order = ['민지', '도윤', null, '민지', null, '도윤', '민지', null];
  for (let i = 0, k = 0; i < pageStarts[10]; k++) {
    const run = 1 + (k % 3 === 0 ? 1 : 0); const who = order[k % order.length];
    for (let r = 0; r < run && i < pageStarts[10]; r++, i++) if (who) local.set(i, {demo: true, readerName: who});
  }
  for (let i = pageStarts[1]; i < pageStarts[2]; i++) if (!local.has(i)) local.set(i, {demo: true, readerName: ['민지', '도윤', '하늘'][i % 3]});
  local.delete(11);
  selected = lines.findIndex((_, i) => !local.has(i)); page = pageFor(selected); render();
}
const DEMO_GOALS = {민지: 120, 도윤: 100, 하늘: 40};
let myGoal = 100;
try { myGoal = Number(localStorage.getItem('relay.goal')) || 100; } catch {}
function showPeople() {
  globalThis.RelayF13?.paint();
  const list = $('people-list'); list.replaceChildren();
  const counts = new Map(); const me = $('reader').value.trim();
  if (!RelayStorage.connected) DEMO_PEOPLE.forEach(n => counts.set(n, 0));
  const all = RelayStorage.connected ? recordings : [...local].map(([index,item])=>({...item,verse:index+1}));
  all.forEach(r => counts.set(r.readerName, (counts.get(r.readerName) || 0) + (r.endVerse??r.verse)-r.verse+1));
  const mine = counts.get(me) || 0;
  $('me-count').textContent = `${mine}절 / ${myGoal}절`; $('me-chip').style.setProperty?.('--pc', personColor(me));
  $('me-chip').style.setProperty?.('--pct', Math.min(100, Math.round(mine / myGoal * 100)) + '%');
  counts.forEach((n, name) => {
    if (name === me) return;
    const goal = DEMO_GOALS[name] || 100, pct = Math.min(100, Math.round(n / goal * 100));
    const li = document.createElement('li'); li.style.setProperty?.('--pc', personColor(name)); li.style.setProperty?.('--pct', pct + '%');
    li.setAttribute('aria-label', `${name} 목표 ${pct}%`);
    const b = document.createElement('b'); b.textContent = name; li.append(b); list.append(li);
  });
}
$('me-count').onclick = () => { const v = prompt('내 목표 절 수', String(myGoal)); const n = Math.round(Number(v)); if (n > 0) { myGoal = n; try { localStorage.setItem('relay.goal', n); } catch {} showPeople();globalThis.RelayF13?.paint(); } };
$('reader').addEventListener('input', showPeople);
function nameView() { $('me-name').textContent = $('reader').value.trim(); $('me-name').hidden = false; $('reader').hidden = true; $('me-ok').hidden = true; }
$('me-name').onclick = () => { $('me-name').hidden = true; $('reader').hidden = false; $('me-ok').hidden = false; $('reader').focus?.(); };
$('me-ok').onclick = () => { $('identity').onsubmit({preventDefault(){}}); nameView(); showPeople(); render(); };
$('reader').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('me-ok').onclick(); } });
document.querySelectorAll?.('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('people-open').onclick = () => { nameView(); showPeople(); $('people').showModal(); };
let lastSheet = 'settings';
try { lastSheet = localStorage.getItem('relay.sheet') || 'settings'; } catch {}
function openSheet(id) { lastSheet = id; try { localStorage.setItem('relay.sheet', id); } catch {} if (id === 'people') { nameView(); showPeople(); } $(id).showModal(); }
$('settings-open').onclick = () => openSheet(lastSheet);
document.querySelectorAll?.('.dlg-tabs button').forEach(b => b.onclick = () => { const cur = b.closest('dialog'); if (b.dataset.go === cur.id) return; cur.close(); openSheet(b.dataset.go); });
document.querySelectorAll?.('.dlg-close').forEach(b => b.onclick = () => b.closest('dialog').close());


// F2 stays dormant while OFF. Polling is only for a connected, enabled phone.
globalThis.RelayF2?.init(()=>revision,()=>render(),()=>{stop();status('잠금 만료. 취소 후 다시 녹음');});

const f8Restored=globalThis.RelayF8?.restore();if(f8Restored){replaceBody(f8Restored);$('text-input').value=editorText();render();}
globalThis.RelayF8?.init({locked:()=>locked(),save:saveBody});
if($('empty-import'))$('empty-import').onclick=()=>{if(locked()||!ready)return;try{globalThis.RelayF8?.open(true);}catch(error){status(error.message);}};
// F5 context is lazy so OFF adds no state changes or server requests.
globalThis.RelayF5?.init({
  text:()=>({title,verses:lines,pageStarts,chapters,books}),revision:()=>revision,
  render:()=>render(),locked:()=>locked(),range:()=>({from:pageStarts[page],to:pageStarts[page+1]??lines.length}),
  color:personColor,number:index=>chapterAt(pageFor(index)).startVerse+index-pageStarts[pageFor(index)],label:index=>`${chapterAt(pageFor(index)).title} ${chapterAt(pageFor(index)).startVerse+index-pageStarts[pageFor(index)]}절`,
  names:()=>[...new Set([$('reader').value.trim(),...(RelayStorage.connected?recordings.map(r=>r.readerName):DEMO_PEOPLE)].filter(Boolean))]
});

$('grid-page')?.addEventListener?.('click', e => { e.stopPropagation(); const from = pageStarts[page], to = pageStarts[page + 1] ?? lines.length; const bands = Math.max(1, Math.ceil((to - from) / 30)); gridBand = (gridBand + 1) % bands; gridManual = true; drawProgress(); });

// F9 grouping edits never silently discard a real recording.
async function saveGroups(next,discardRecordings) {
  if(locked() || !ready)throw Error('녹음 확인 또는 연결 필요');
  busy=true;stopPlayback();globalThis.RelayF4?.cancel();controls();
  try {
    if(RelayStorage.connected){await RelayStorage.request('saveGroups',{revision,groups:next,discardRecordings});await refresh();}
    else {
      const affected=[...local].filter(([index,item])=>RelayF9.changed({...item,verse:index+1},next));
      if(!discardRecordings&&affected.some(([,item])=>!item.demo)){const error=Error('변경될 녹음 삭제 동의 필요');error.code='RECORDINGS_EXIST';throw error;}
      RelayF9.remember(next);globalThis.RelayF5?.regroup(next);for(const [index]of affected)local.delete(index);
      RelayF9.set(next,{verses:lines,pageStarts});
    }
  }finally{busy=false;render();}
}
globalThis.RelayF9?.init({text:()=>({title,verses:lines,pageStarts,chapters,books}),locked:()=>locked(),render:()=>render(),report:status,
  label:(start,end)=>{const ch=pageFor(start),base=chapterAt(ch).startVerse-pageStarts[ch];return `${base+start}–${base+end}`;},
  records:()=>RelayStorage.connected?recordings:[...local].map(([index,item])=>({...item,verse:index+1})),save:saveGroups});

let toastTimer = null;
function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList?.add?.('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList?.remove?.('show'), 1200); }
// 시트 위치: 틀 고정 줄 바로 아래
function sheetTop() { const r = document.getElementById('sticky')?.getBoundingClientRect?.(); if (r) document.documentElement?.style?.setProperty?.('--sheet-top', Math.round(r.bottom) + 'px'); }
['book-picker','people','settings'].forEach(id => { const d = $(id); const o = d.showModal?.bind(d); if (o) d.showModal = () => { sheetTop(); o(); }; });
// 책 창 좌우 쓸기: 구약 ↔ 신약 (넘어가지 않음)
{ let x0 = null; const it = $('picker-items');
  it.addEventListener?.('touchstart', e => { x0 = e.touches[0].clientX; }, {passive: true});
  it.addEventListener?.('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) <= 60) return; if (it.className === 'books') setBookSide(bookSide + (dx < 0 ? 1 : -1)); else chRender?.(dx < 0 ? 1 : -1); }); }
// ⑥ 절 블록 좌우 쓸기
{ let x0 = null; const c = $('center');
  c.addEventListener?.('touchstart', e => { x0 = e.touches[0].clientX; gridSwiped = false; e.stopPropagation(); }, {passive: true});
  c.addEventListener?.('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; e.stopPropagation();
    if (Math.abs(dx) > 30) { gridSwiped = true; setTimeout(() => { gridSwiped = false; }, 300); const from = pageStarts[page], to = pageStarts[page + 1] ?? lines.length; const bands = Math.max(1, Math.ceil((to - from) / 20)); const nb = gridBand + (dx < 0 ? 1 : -1); if (nb >= 0 && nb < bands) { gridBand = nb; gridManual = true; drawProgress(); } } }); }

let bookFont = .95;
try { bookFont = Number(localStorage.getItem('relay.bfont')) || .95; } catch {}
function applyBookFont() { document.documentElement?.style?.setProperty?.('--bfs', bookFont + 'rem'); try { localStorage.setItem('relay.bfont', bookFont); } catch {} }
$('bfont-down').onclick = () => { bookFont = Math.max(.7, +(bookFont - .05).toFixed(2)); applyBookFont(); };
$('bfont-up').onclick = () => { bookFont = Math.min(1.3, +(bookFont + .05).toFixed(2)); applyBookFont(); };
applyBookFont();
$('settings-open').addEventListener?.('click', e => e.stopPropagation());
$('center').addEventListener?.('touchmove', e => { e.preventDefault?.(); e.stopPropagation(); }, {passive: false});

let headFont = 1.15;
try { headFont = Number(localStorage.getItem('relay.hfont')) || 1.15; } catch {}
function applyHeadFont() { document.documentElement?.style?.setProperty?.('--hfs', headFont + 'rem'); try { localStorage.setItem('relay.hfont', headFont); } catch {} }
$('hfont-down').onclick = () => { headFont = Math.max(.8, +(headFont - .05).toFixed(2)); applyHeadFont(); };
$('hfont-up').onclick = () => { headFont = Math.min(1.6, +(headFont + .05).toFixed(2)); applyHeadFont(); };
applyHeadFont();

// F11 never advances F4 on a local-only queued take.
globalThis.RelayF11?.init({locked,ready:()=>ready,busy:value=>{busy=value;controls();},base64,refresh:async()=>{await refresh();render();},render:()=>render(),report:status});

// F12 takes a stable chapter snapshot; no demo or queued blobs become exported audio.
globalThis.RelayF12?.init({locked,ready:()=>ready,busy:value=>{busy=value;controls();},report:status,
  snapshot:()=>{const from=pageStarts[page],to=pageStarts[page+1]??lines.length;return {revision,from,to,name:`${bookAt(page).title} ${chapterAt(page).title}`,items:(RelayStorage.connected?recordings:[...local].map(([index,item])=>({...item,verse:index+1}))).filter(item=>!item.demo&&item.verse>from&&item.verse<=to).sort((a,b)=>a.verse-b.verse)};},
  audio:async(item,snapshotRevision)=>{if(!RelayStorage.connected)return item.blob;const data=await RelayStorage.request('getAudio',{revision:snapshotRevision,verse:item.verse});return new Blob([Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0))],{type:data.mimeType});}
});

globalThis.RelayF13?.init({notify:toast,state:()=>{const from=pageStarts[page],to=pageStarts[page+1]??lines.length,name=$('reader').value.trim();let mine=0;for(let index=0;index<lines.length;index++){const r=recordingAt(index);if(r&&!r.demo&&r.readerName===name)mine++;}let chapterComplete=to>from;for(let index=from;index<to;index++){const r=recordingAt(index);if(!r||r.demo)chapterComplete=false;}return {revision:revision||JSON.stringify([title,lines]),book:bookAt(page).title,chapter:chapterAt(page).title,chapterComplete,name,mine,goal:myGoal};}});

globalThis.RelayF14?.init({state:()=>({book:bookAt(page).title,chapter:chapterAt(page).title,from:pageStarts[page],startVerse:chapterAt(page).startVerse,count:(pageStarts[page+1]??lines.length)-pageStarts[page]})});

globalThis.RelayDrafts?.init({revision:()=>revision,ready:()=>ready&&!busy,locked});
