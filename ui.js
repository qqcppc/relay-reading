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
function hasAudio(i) { return RelayStorage.connected ? recordings.some(r => r.verse === i + 1) : local.has(i); }
function locked() { return busy || acquiring || !!recorder || !!draft; }
function controls() {
  $('book-open').disabled = locked() || !ready || !lines.length;
  $('prev-page').disabled = locked() || page === 0;
  $('next-page').disabled = locked() || page >= pageStarts.length - 1;
  ['all','refresh','save-text','disconnect'].forEach(id => { $(id).disabled = locked() || !ready && id !== 'refresh' && id !== 'disconnect'; });
  ['ok','listen','no'].forEach(id => { $(id).disabled = busy; });
  $('text-input').disabled = locked();
  $('reader').disabled = busy || acquiring || !!recorder;
}
function render() {
  $('heading').textContent = title || '공유 본문 없음';
  page = Math.max(0, Math.min(page, pageStarts.length - 1));
  $('book-open').textContent = `📖 ${bookAt(page).title} ▾`;
  const chapter = chapterAt(page);
  const endVerse = chapter.startVerse + (pageStarts[page + 1] ?? lines.length) - pageStarts[page] - 1;
  $('page-label').textContent = `${chapter.title} · ${chapter.startVerse}~${endVerse}절 ▾`; $('version').textContent = `${bookAt(page).title} ${chapter.title}`; $('ver-sub').textContent = `${chapter.startVerse}~${endVerse}절 · #25`;
  review.remove();
  $('list').replaceChildren();
  lines.forEach((text, i) => {
    if (i < pageStarts[page] || i >= (pageStarts[page + 1] ?? lines.length)) return;
    const row = document.createElement('div');
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'card-trigger';
    row.className = 'line' + (i === selected ? ' sel' : '') + (hasAudio(i) ? ' done' : '') + (recorder && i === selected ? ' recording' : '');
    if (globalThis.RelayF2?.blocked(i + 1)) row.className += ' f2-locked';
    row.style.textAlign = 'left'; row.style.width = '100%';
    const tag = document.createElement('span'); tag.className = 'tag';
    const item = RelayStorage.connected ? recordings.find(r => r.verse === i + 1) : local.get(i);
    tag.textContent = globalThis.RelayF2?.blocked(i + 1) ? '잠금' : item ? item.readerName : '';
    if (item) row.style.setProperty?.('--pc', personColor(item.readerName));
    const vn = document.createElement('span'); vn.className = 'vn'; vn.textContent = String(chapter.startVerse + i - pageStarts[page]);
    const side = document.createElement('span'); side.className = 'side'; side.append(vn, tag);
    const content = document.createElement('span'); content.className = 't'; content.textContent = text;
    trigger.setAttribute('aria-label', `${chapter.startVerse + i - pageStarts[page]}절 ${text}${recorder && i === selected ? ' · 녹음 중, 누르면 정지' : ''}`);
    trigger.append(side, content); row.append(trigger);
    trigger.onclick = () => { if (suppressClick) { suppressClick = false; return; } if (recorder && i === selected) { stop(); return; } if (locked() || !ready) return; if (playingIndex === i) { stopPlayback(); status(''); return; } selected = i; followSelected(); if (hasAudio(i)) play(i); };
    wireCard(trigger, i);
    if (draft && draft.verse === i + 1) row.append(review);
    $('list').append(row);
  });
  if (!draft) { review.hidden = true; $('list').after(review); }
  drawProgress();
  controls();
}
function drawProgress() {
  const bar = $('progress'); if (!bar) return; bar.replaceChildren();
  const from = pageStarts[page], to = pageStarts[page + 1] ?? lines.length;
  for (let i = from; i < to; i++) {
    const seg = document.createElement('button'); seg.type = 'button';
    seg.className = 'seg' + (hasAudio(i) ? ' done' : '') + (i === selected ? ' cur' : '');
    const who = RelayStorage.connected ? recordings.find(r => r.verse === i + 1) : local.get(i); if (who) seg.style.setProperty?.('--pc', personColor(who.readerName));
    seg.setAttribute('aria-label', `${i - from + 1}절${hasAudio(i) ? ' 녹음됨' : ''}`);
    seg.onclick = () => { if (locked() || !ready) return; selected = i; revealSelected(); };
    bar.append(seg);
  }
}
function pageFor(i) { return Math.max(0, pageStarts.findLastIndex(start => start <= i)); }
function followSelected() { page = pageFor(selected); render(); }
function revealSelected() {
  followSelected();
  requestAnimationFrame(() => {
    $('list').children[selected - pageStarts[page]]?.scrollIntoView({behavior: 'instant', block: 'nearest'});
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
  if (sequence === undefined) { stopPlayback(); sequence = playbackId; }
  try {
    status('');
    let blob;
    if (RelayStorage.connected) {
      const data = await RelayStorage.request('getAudio', {revision, verse: i + 1});
      blob = new Blob([Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))], {type: data.mimeType});
    } else blob = local.get(i)?.blob;
    if (sequence !== playbackId || !blob) return;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(blob); player.src = playbackUrl; playingIndex = i; if (chain) { $('all').textContent = '■'; $('play-ic').textContent = '■'; }
    selected = i; followSelected();
    player.onended = () => {
      if (sequence !== playbackId) return;
      const next = lines.findIndex((_, k) => k > i && hasAudio(k));
      if (chain && next >= 0) play(next, true, sequence); else { stopPlayback(); status(''); }
    };
    await player.play(); if (sequence === playbackId) status('');
  } catch (err) { if (sequence === playbackId) { stopPlayback(); await failure(err); } }
}
player.onerror = () => { stopPlayback(); status('음성 재생 실패. 절을 눌러 다시 시도'); };
async function refresh() {
  const snapshot = await RelayStorage.load();
  revision = snapshot.text.revision; title = snapshot.text.title; lines = snapshot.text.verses; pageStarts = snapshot.text.pageStarts || [0]; chapters = snapshot.text.chapters || []; books = snapshot.text.books || [{title: title.slice(0,80) || '본문',startChapter:0}];
  recordings = snapshot.recordings;
  selected = lines.findIndex((_, i) => !hasAudio(i)); if (selected < 0) selected = 0;
  ready = true; $('connection').textContent = '공유 모드 · 녹음·본문을 그룹과 공유';
  page = pageFor(selected);
  $('text-input').value = editorText();
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
  catch (err) { ready = false; $('connection').textContent = '연결 실패: ' + err.message; }
  finally { busy = false; render(); }
}
function discard() {
  $('au').pause(); $('au').removeAttribute('src'); $('au').load();
  $('au').pause(); if (draft) URL.revokeObjectURL(draft.url); globalThis.RelayF2?.release(); draft = null; $('review').hidden = true; controls();
}
async function start(event) {
  event.preventDefault();
  if (locked() || !ready || !lines.length) return;
  if (!$('reader').value.trim()) { status('먼저 읽는 사람 이름 입력'); $('reader').focus(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { status('HTTPS와 녹음을 지원하는 브라우저 필요'); return; }
  const item = RelayStorage.connected ? recordings.find(r => r.verse === selected + 1) : local.get(selected);
  if (globalThis.RelayF2?.blocked(selected + 1)) { status('다른 폰에서 읽는 중'); return; }
  if (globalThis.RelayF2?.ownerBlocked(item, $('reader').value)) { status('녹음한 이름만 다시 녹음 가능'); return; }
  const epoch = ++captureEpoch;
  acquiring = true; stopPlayback(); controls();
  const target = {verse: selected + 1, revision, readerName: $('reader').value.trim()};
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
    const current = recorder;
    current.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); total += e.data.size; if (total > 5 * 1024 * 1024) { tooLarge = true; stop(); } } };
    current.onstop = () => {
      stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null;
      const blob = new Blob(chunks, {type: current.mimeType});
      if (tooLarge || blob.size > 5 * 1024 * 1024 || !blob.size) { globalThis.RelayF2?.release(); status('녹음은 0바이트 초과 5MiB 이하만 가능. 다시 녹음'); }
      else { draft = {...target, blob, url: URL.createObjectURL(blob)}; $('au').src = draft.url; $('review').hidden = false; status(''); }
      render();
    };
    current.onerror = () => { status('녹음 장치 오류. 취소 후 다시 시도'); stop(); };
    current.start(250); render(); status('');
  } catch (err) { stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null; globalThis.RelayF2?.release(); status('녹음 실패: ' + err.message); }
  finally { acquiring = false; controls(); }
}
function stop() { if (acquiring) captureEpoch++; if (recorder?.state === 'recording') recorder.stop(); }
function base64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('녹음 읽기 실패')); reader.readAsDataURL(blob); });
}
$('ok').onclick = async () => {
  if (!draft || busy || !ready) return;
  busy = true; controls(); const pending = draft; let saved = false;
  try {
    if (RelayStorage.connected) {
      const item = await RelayStorage.request('uploadRecording', {...globalThis.RelayF2?.uploadFields(), revision: pending.revision, verse: pending.verse, readerName: pending.readerName, mimeType: pending.blob.type, audioBase64: await base64(pending.blob)});
      recordings = recordings.filter(r => r.verse !== item.verse).concat(item);
    } else local.set(pending.verse - 1, {blob: pending.blob, readerName: pending.readerName});
    discard(); selected = lines.findIndex((_, i) => !hasAudio(i)); if (selected < 0) selected = pending.verse - 1;
    status(''); saved = true;
  } catch (err) { await failure(err); if (ready) status('저장 확인 실패. 임시 녹음 유지 · 재시도하거나 취소 후 목록 새로고침'); }
  finally { busy = false; render(); if (saved) revealSelected(); }
};
$('no').onclick = () => { if (!busy) { discard(); const next = lines.findIndex((_, i) => !hasAudio(i)); if (next >= 0) selected = next; render(); revealSelected(); status(''); } };
$('save-text').onclick = async () => {
  if (locked() || !ready) return;
  if (!$('erase-confirm').checked) { status('기존 녹음 삭제 동의에 체크 필요'); return; }
  const input = $('text-input').value.replace(/\r\n?/g, '\n').trim();
  const newline = input.indexOf('\n');
  const nextTitle = (newline < 0 ? input : input.slice(0, newline)).trim();
  const parsed = parsePages(newline < 0 ? '' : input.slice(newline + 1), nextTitle);
  const verses = parsed.verses;
  if (parsed.books.some(b => !b.title || b.title.length > 80) || parsed.chapters.some(c => !c.title || c.title.length > 80 || !Number.isSafeInteger(c.startVerse) || c.startVerse > 1000000) || !nextTitle || nextTitle.length > 200 || !verses.length || verses.length > 500 || verses.some(v => !v || v.length > 10000) || JSON.stringify({title:nextTitle,verses}).length > 500000) { status('제목·절 형식/길이 확인 필요'); return; }
  busy = true; stopPlayback(); controls();
  try {
    const text = RelayStorage.connected ? await RelayStorage.request('saveText', {title: nextTitle, verses, pageStarts: parsed.pageStarts, chapters: parsed.chapters, books: parsed.books, revision}) : {title: nextTitle, verses, pageStarts: parsed.pageStarts, chapters: parsed.chapters, books: parsed.books};
    title = text.title; lines = text.verses; pageStarts = text.pageStarts || [0]; chapters = text.chapters || []; books = text.books || [{title:title.slice(0,80),startChapter:0}]; page = 0; revision = text.revision; recordings = []; local.clear(); selected = 0;
    $('erase-confirm').checked = false; $('editor').open = false; status('본문 저장 완료 · 기존 녹음 초기화');
  } catch (err) { await failure(err); }
  finally { busy = false; render(); }
};
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
      start({preventDefault() {}});
    }, 450);
  });
  row.addEventListener('pointermove', e => { if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12) cancelGesture(); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => row.addEventListener(type, cancelGesture));
  row.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r' && !locked() && ready) { e.preventDefault(); selected = i; start(e); } });
}
function changePage(next) { if (locked() || next < 0 || next >= pageStarts.length) return; cancelGesture(); stopPlayback(); page = next; selected = pageStarts[page]; render(); revealSelected(); }
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
function bookButton(label, index) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  if (index < 0) { button.className = 'empty'; button.onclick = () => showSampleChapters(label); }
  else { button.setAttribute('aria-current', String(index === bookIndex(page))); button.onclick = () => showChapters(index); }
  return button;
}
function showSampleChapters(name) {
  const count = (BIBLE.find(b => b[0] === name) || [name, 1])[1];
  $('picker-title').textContent = name + ' (준비 중)'; $('picker-back').hidden = false;
  const items = $('picker-items'); items.replaceChildren(); items.className = 'chapters';
  for (let c = 1; c <= count; c++) { const button = document.createElement('button'); button.type = 'button'; button.textContent = String(c); button.disabled = true; items.append(button); }
  items.scrollTop = 0;
}
function showBooks() {
  $('picker-title').textContent = '책'; $('picker-back').hidden = true;
  const items = $('picker-items'); items.replaceChildren(); items.className = 'testaments';
  const known = new Set(BIBLE.map(b => b[0]));
  [['구약', BIBLE.slice(0, 39)], ['신약', BIBLE.slice(39)]].forEach(([name, list]) => {
    const col = document.createElement('div'); col.className = 'col';
    const head = document.createElement('h3'); head.textContent = name; col.append(head);
    list.forEach(([t]) => col.append(bookButton(t, books.findIndex(b => b.title === t))));
    items.append(col);
  });
  const extra = books.map((b, i) => [b, i]).filter(([b]) => !known.has(b.title));
  if (extra.length) {
    const col = document.createElement('div'); col.className = 'col';
    extra.forEach(([b, i]) => col.append(bookButton(b.title, i))); items.append(col);
  }
  items.scrollTop = 0;
}
function showChapters(index) {
  const book = books[index]; $('picker-title').textContent = book.title; $('picker-back').hidden = false;
  const items = $('picker-items'); items.replaceChildren(); items.className = 'chapters';
  const end = books[index + 1]?.startChapter ?? pageStarts.length;
  for (let chapter = book.startChapter; chapter < end; chapter++) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = String(chapter - book.startChapter + 1);
    button.setAttribute('aria-label', chapterAt(chapter).title); button.setAttribute('aria-current', String(chapter === page));
    button.onclick = () => { if (locked() || !ready) return; $('book-picker').close(); changePage(chapter); };
    items.append(button);
  }
  items.scrollTop = 0;
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
$('all').onclick = () => { if (playbackUrl) { stopPlayback(); status(''); return; } const first = lines.findIndex((_, i) => hasAudio(i)); if (first >= 0) play(first, true); else status('아직 녹음 없음'); };
$('refresh').onclick = loadShared;
$('reader').value = RelayStorage.readerName;
$('identity').onsubmit = e => { e.preventDefault(); try { RelayStorage.setReaderName($('reader').value); status(''); } catch (err) { status(err.message); } };
$('disconnect').onclick = () => { if (locked()) return; try { RelayStorage.disconnect(); location.reload(); } catch (err) { status(err.message); } };
try { RelayStorage.acceptLink(location, history); } catch (err) { $('connection').textContent = err.message; }
ready = !RelayStorage.connected;
$('text-input').value = editorText();
if (RelayStorage.connected) { $('refresh').hidden = false; $('disconnect').hidden = false; loadShared(); }
render();

$('listen').onclick = () => { const a = $('au'); if (a.paused) { a.currentTime = 0; a.play().catch(() => status('미리듣기 실패. 다시 시도')); $('listen').textContent = '■ 멈춤'; } else { a.pause(); $('listen').textContent = '▶ 듣기'; } };
$('au').onended = $('au').onpause = () => { $('listen').textContent = '▶ 듣기'; };

$('title-btn').onclick = () => $('book-open').onclick();
$('center').onclick = () => $('all').onclick();
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

const PALETTE = ['#5f8f74','#8a7aa6','#b8925a','#5d8c9c','#b07a86','#7f8a5a'];
function personColor(name) {
  const me = ($('reader').value || RelayStorage.readerName || '').trim();
  if (name && name === me) return PALETTE[0];
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[1 + h % (PALETTE.length - 1)];
}
// 연출용 가상 녹음 (#22): 창세기 1~10장에 민지(많이)·도윤(조금) 녹음, 하늘 미참여. 실제 녹음본만 표시할 때 이 블록 삭제
const DEMO_PEOPLE = ['민지', '도윤', '하늘'];
if (!RelayStorage.connected) {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < pageStarts[10]; ) {
    const r = rnd(), run = 2 + Math.floor(rnd() * 6);
    const who = r < .45 ? '민지' : r < .65 ? '도윤' : null;
    for (let k = 0; k < run && i < pageStarts[10]; k++, i++) if (who) local.set(i, {demo: true, readerName: who});
  }
  selected = lines.findIndex((_, i) => !local.has(i)); page = pageFor(selected); render();
}
function showPeople() {
  const list = $('people-list'); list.replaceChildren();
  const counts = new Map(); const me = $('reader').value.trim();
  DEMO_PEOPLE.forEach(n => counts.set(n, 0));
  const all = RelayStorage.connected ? recordings : [...local.values()];
  all.forEach(r => counts.set(r.readerName, (counts.get(r.readerName) || 0) + 1));
  $('me-count').textContent = `${counts.get(me) || 0}절`; $('me-chip').style.setProperty?.('--pc', personColor(me));
  counts.forEach((n, name) => {
    if (name === me) return;
    const li = document.createElement('li'); li.style.setProperty?.('--pc', personColor(name));
    const b = document.createElement('b'); b.textContent = name; const c = document.createElement('small'); c.textContent = `${n}절`;
    li.append(b, c); list.append(li);
  });
}
$('reader').addEventListener('input', showPeople);
$('people-open').onclick = () => { showPeople(); $('people').showModal(); };
$('settings-open').onclick = () => $('settings').showModal();
document.querySelectorAll?.('.dlg-close').forEach(b => b.onclick = () => b.closest('dialog').close());


// F2 stays dormant while OFF. Polling is only for a connected, enabled phone.
globalThis.RelayF2?.init(()=>revision,()=>render(),()=>{stop();status('잠금 만료. 취소 후 다시 녹음');});
