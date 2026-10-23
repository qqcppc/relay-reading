'use strict';
const $ = id => document.getElementById(id);
const review = $('review');
let lines = [
'동해 물과 백두산이 마르고 닳도록','하느님이 보우하사 우리나라 만세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세',
'남산 위에 저 소나무 철갑을 두른 듯','바람 서리 불변함은 우리 기상일세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세',
'가을 하늘 공활한데 높고 구름 없이','밝은 달은 우리 가슴 일편단심일세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세',
'이 기상과 이 맘으로 충성을 다하여','괴로우나 즐거우나 나라 사랑하세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세'];
let books = [{title:'1권',startChapter:0},{title:'2권',startChapter:2}];
let chapters = [{title:'1장',startVerse:1},{title:'2장',startVerse:5},{title:'3장',startVerse:9},{title:'4장',startVerse:13}];
let pageStarts = [0, 4, 8, 12], page = 0, holdTimer = null, gesture = null, suppressClick = false;
let title = '애국가', revision = null, recordings = [], selected = 0;
let busy = false, ready = !RelayStorage.connected, acquiring = false;
let recorder = null, stream = null, draft = null, recordTarget = null;
let captureEpoch = 0;
let playbackId = 0, playbackUrl = null;
const local = new Map(), player = new Audio();
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
  $('identity').querySelector('button').disabled = busy || acquiring || !!recorder;
}
function render() {
  $('heading').textContent = title || '공유 본문 없음';
  page = Math.max(0, Math.min(page, pageStarts.length - 1));
  $('book-open').textContent = `📖 ${bookAt(page).title} ▾`;
  const chapter = chapterAt(page);
  const endVerse = chapter.startVerse + (pageStarts[page + 1] ?? lines.length) - pageStarts[page] - 1;
  $('page-label').textContent = `${bookAt(page).title} ${chapter.title}\n${chapter.startVerse}~${endVerse}절 ▾`; $('page-label').style.whiteSpace = 'pre-line';
  review.remove();
  $('list').replaceChildren();
  lines.forEach((text, i) => {
    if (i < pageStarts[page] || i >= (pageStarts[page + 1] ?? lines.length)) return;
    const row = document.createElement('div');
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'card-trigger';
    row.className = 'line' + (i === selected ? ' sel' : '') + (hasAudio(i) ? ' done' : '') + (recorder && i === selected ? ' recording' : '');
    row.style.textAlign = 'left'; row.style.width = '100%';
    const tag = document.createElement('span'); tag.className = 'tag';
    const item = RelayStorage.connected ? recordings.find(r => r.verse === i + 1) : local.get(i);
    tag.textContent = `${chapter.startVerse + i - pageStarts[page]}절 · ${item ? '✅ ' + item.readerName + ' (눌러 재생 · 꾹 눌러 재녹음)' : i === selected ? '⏩ 지금 차례' : '대기'}`;
    const content = document.createElement('span'); content.className = 't'; content.textContent = text;
    if (recorder && i === selected) tag.textContent = `${chapter.startVerse + i - pageStarts[page]}절`;
    trigger.setAttribute('aria-label', `${chapter.startVerse + i - pageStarts[page]}절 ${text}${recorder && i === selected ? ' · 녹음 중, 누르면 정지' : ''}`);
    trigger.append(tag, content); row.append(trigger);
    trigger.onclick = () => { if (suppressClick) { suppressClick = false; return; } if (recorder && i === selected) { stop(); return; } if (locked() || !ready) return; selected = i; followSelected(); if (hasAudio(i)) play(i); };
    wireCard(trigger, i);
    if (draft && draft.verse === i + 1) row.append(review);
    $('list').append(row);
  });
  if (!draft) { review.hidden = true; $('list').after(review); }
  controls();
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
  playbackId++; player.pause(); player.onended = null; player.removeAttribute('src'); player.load();
  if (playbackUrl) URL.revokeObjectURL(playbackUrl); playbackUrl = null;
  $('all').textContent = '▶ 처음부터 이어듣기';
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
    playbackUrl = URL.createObjectURL(blob); player.src = playbackUrl; if (chain) $('all').textContent = '■ 정지';
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
  $('au').pause(); if (draft) URL.revokeObjectURL(draft.url); draft = null; $('review').hidden = true; controls();
}
async function start(event) {
  event.preventDefault();
  if (locked() || !ready || !lines.length) return;
  if (!$('reader').value.trim()) { status('먼저 읽는 사람 이름 입력'); $('reader').focus(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { status('HTTPS와 녹음을 지원하는 브라우저 필요'); return; }
  const epoch = ++captureEpoch;
  acquiring = true; stopPlayback(); controls();
  const target = {verse: selected + 1, revision, readerName: $('reader').value.trim()};
  try {
    RelayStorage.setReaderName(target.readerName);
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
    if (epoch !== captureEpoch || document.hidden) { stream.getTracks().forEach(track => track.stop()); stream = null; return; }
    const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('이 브라우저는 webm/ogg 녹음 미지원');
    const chunks = []; let total = 0, tooLarge = false;
    recorder = new MediaRecorder(stream, {mimeType: mime}); recordTarget = target;
    const current = recorder;
    current.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); total += e.data.size; if (total > 5 * 1024 * 1024) { tooLarge = true; stop(); } } };
    current.onstop = () => {
      stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null;
      const blob = new Blob(chunks, {type: current.mimeType});
      if (tooLarge || blob.size > 5 * 1024 * 1024 || !blob.size) status('녹음은 0바이트 초과 5MiB 이하만 가능. 다시 녹음');
      else { draft = {...target, blob, url: URL.createObjectURL(blob)}; $('au').src = draft.url; $('review').hidden = false; status(''); }
      render();
    };
    current.onerror = () => { status('녹음 장치 오류. 취소 후 다시 시도'); stop(); };
    current.start(250); render(); status('');
  } catch (err) { stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null; status('녹음 실패: ' + err.message); }
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
      const item = await RelayStorage.request('uploadRecording', {revision: pending.revision, verse: pending.verse, readerName: pending.readerName, mimeType: pending.blob.type, audioBase64: await base64(pending.blob)});
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
function showBooks() {
  $('picker-title').textContent = '책'; $('picker-back').hidden = true;
  const items = $('picker-items'); items.replaceChildren(); items.className = '';
  books.forEach((book, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = book.title;
    button.setAttribute('aria-current', String(index === bookIndex(page)));
    button.onclick = () => showChapters(index); items.append(button);
  });
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
$('identity').onsubmit = e => { e.preventDefault(); try { RelayStorage.setReaderName($('reader').value); status('이름 기억 완료'); } catch (err) { status(err.message); } };
$('disconnect').onclick = () => { if (locked()) return; try { RelayStorage.disconnect(); location.reload(); } catch (err) { status(err.message); } };
try { RelayStorage.acceptLink(location, history); } catch (err) { $('connection').textContent = err.message; }
ready = !RelayStorage.connected;
$('text-input').value = editorText();
if (RelayStorage.connected) { $('refresh').hidden = false; $('disconnect').hidden = false; loadShared(); }
render();

$('listen').onclick = () => { const a = $('au'); if (a.paused) { a.currentTime = 0; a.play().catch(() => status('미리듣기 실패. 다시 시도')); $('listen').textContent = '■ 멈춤'; } else { a.pause(); $('listen').textContent = '▶ 듣기'; } };
$('au').onended = $('au').onpause = () => { $('listen').textContent = '▶ 듣기'; };

$('page-label').setAttribute('role','button'); $('page-label').onclick = () => $('book-open').onclick();
