'use strict';
const $ = id => document.getElementById(id);
let lines = ['동해 물과 백두산이 마르고 닳도록','하느님이 보우하사 우리나라 만세','무궁화 삼천리 화려 강산','대한 사람 대한으로 길이 보전하세'];
let title = '🎤 릴레이 녹음 시험', revision = null, recordings = [], selected = 0;
let busy = false, ready = !RelayStorage.connected, pressed = false, acquiring = false;
let recorder = null, stream = null, draft = null, recordTarget = null;
let playbackId = 0, playbackUrl = null;
const local = new Map(), player = new Audio();
function status(message) { $('st').textContent = message; }
function hasAudio(i) { return RelayStorage.connected ? recordings.some(r => r.verse === i + 1) : local.has(i); }
function locked() { return busy || acquiring || !!recorder || !!draft; }
function controls() {
  $('hold').disabled = busy || !ready || !lines.length || !!draft;
  ['all','refresh','save-text','disconnect'].forEach(id => { $(id).disabled = locked() || !ready && id !== 'refresh' && id !== 'disconnect'; });
  ['ok','re','no'].forEach(id => { $(id).disabled = busy; });
  $('text-input').disabled = locked();
  $('identity').querySelector('button').disabled = busy || acquiring || !!recorder;
}
function render() {
  $('heading').textContent = title || '공유 본문 없음';
  $('list').replaceChildren();
  lines.forEach((text, i) => {
    const row = document.createElement('button'); row.type = 'button';
    row.className = 'line' + (i === selected ? ' sel' : '') + (hasAudio(i) ? ' done' : '');
    row.style.textAlign = 'left'; row.style.width = '100%';
    const tag = document.createElement('span'); tag.className = 'tag';
    const item = RelayStorage.connected ? recordings.find(r => r.verse === i + 1) : local.get(i);
    tag.textContent = `${i + 1}줄 · ${item ? '✅ ' + item.readerName + ' (누르면 재생·다시 녹음 가능)' : i === selected ? '⏩ 지금 차례' : '대기'}`;
    const content = document.createElement('span'); content.className = 't'; content.textContent = text;
    row.append(tag, content);
    row.onclick = () => { if (locked() || !ready) return; selected = i; render(); if (hasAudio(i)) play(i); };
    $('list').append(row);
  });
  controls();
}
function revealSelected() {
  requestAnimationFrame(() => {
    $('list').children[selected]?.scrollIntoView({behavior: 'instant', block: 'start'});
  });
}
function stopPlayback() {
  playbackId++; player.pause(); player.onended = null; player.removeAttribute('src'); player.load();
  if (playbackUrl) URL.revokeObjectURL(playbackUrl); playbackUrl = null;
}
async function play(i, chain = false, sequence) {
  if (locked() || !ready) return;
  if (sequence === undefined) { stopPlayback(); sequence = playbackId; }
  try {
    status(`⏳ ${i + 1}줄 불러오는 중`);
    let blob;
    if (RelayStorage.connected) {
      const data = await RelayStorage.request('getAudio', {revision, verse: i + 1});
      blob = new Blob([Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))], {type: data.mimeType});
    } else blob = local.get(i)?.blob;
    if (sequence !== playbackId || !blob) return;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(blob); player.src = playbackUrl;
    selected = i; render();
    player.onended = () => {
      if (sequence !== playbackId) return;
      const next = lines.findIndex((_, k) => k > i && hasAudio(k));
      if (chain && next >= 0) play(next, true, sequence); else { stopPlayback(); status('재생 끝'); }
    };
    await player.play(); if (sequence === playbackId) status(`▶ ${i + 1}줄 재생`);
  } catch (err) { if (sequence === playbackId) { stopPlayback(); await failure(err); } }
}
player.onerror = () => { stopPlayback(); status('음성 재생 실패. 절을 눌러 다시 시도'); };
async function refresh() {
  const snapshot = await RelayStorage.load();
  revision = snapshot.text.revision; title = snapshot.text.title; lines = snapshot.text.verses;
  recordings = snapshot.recordings;
  selected = lines.findIndex((_, i) => !hasAudio(i)); if (selected < 0) selected = 0;
  ready = true; $('connection').textContent = '공유 모드 · 녹음·본문을 그룹과 공유';
  $('text-input').value = [title, ...lines].join('\n\n');
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
  try { await refresh(); status('공유 본문·목록 갱신 완료'); }
  catch (err) { ready = false; $('connection').textContent = '연결 실패: ' + err.message; }
  finally { busy = false; render(); }
}
function discard() {
  $('au').pause(); $('au').removeAttribute('src'); $('au').load();
  if (draft) URL.revokeObjectURL(draft.url); draft = null; $('review').hidden = true; controls();
}
async function start(event) {
  event.preventDefault();
  if (locked() || !ready || !lines.length) return;
  if (!$('reader').value.trim()) { status('먼저 읽는 사람 이름 입력'); $('reader').focus(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { status('HTTPS와 녹음을 지원하는 브라우저 필요'); return; }
  pressed = true; acquiring = true; stopPlayback(); controls();
  const target = {verse: selected + 1, revision, readerName: $('reader').value.trim()};
  try {
    RelayStorage.setReaderName(target.readerName);
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
    if (!pressed) { stream.getTracks().forEach(t => t.stop()); stream = null; return; }
    const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('이 브라우저는 webm/ogg 녹음 미지원');
    const chunks = []; let total = 0, tooLarge = false;
    recorder = new MediaRecorder(stream, {mimeType: mime}); recordTarget = target;
    const current = recorder;
    current.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); total += e.data.size; if (total > 5 * 1024 * 1024) { tooLarge = true; stop(); } } };
    current.onstop = () => {
      stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null;
      $('hold').classList.remove('on');
      const blob = new Blob(chunks, {type: current.mimeType});
      if (tooLarge || blob.size > 5 * 1024 * 1024 || !blob.size) status('녹음은 0바이트 초과 5MiB 이하만 가능. 다시 녹음');
      else { draft = {...target, blob, url: URL.createObjectURL(blob)}; $('au').src = draft.url; $('review').hidden = false; status(`${target.verse}줄 녹음 완료 · 확인하면 저장`); }
      controls();
    };
    current.onerror = () => { status('녹음 장치 오류. 취소 후 다시 시도'); stop(); };
    current.start(250); $('hold').classList.add('on'); status(`● ${target.verse}줄 녹음 중`);
  } catch (err) { stream?.getTracks().forEach(t => t.stop()); stream = null; recorder = null; status('녹음 실패: ' + err.message); }
  finally { acquiring = false; controls(); }
}
function stop() { pressed = false; if (recorder?.state === 'recording') recorder.stop(); }
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
    status(`✅ ${pending.verse}줄 저장 완료`); saved = true;
  } catch (err) { await failure(err); if (ready) status('저장 확인 실패. 임시 녹음 유지 · 재시도하거나 취소 후 목록 새로고침'); }
  finally { busy = false; render(); if (saved) revealSelected(); }
};
$('no').onclick = () => { if (!busy) { discard(); const next = lines.findIndex((_, i) => !hasAudio(i)); if (next >= 0) selected = next; render(); revealSelected(); status('취소됨'); } };
$('re').onclick = () => { if (!busy) { discard(); status('다시 꾹 눌러 녹음'); } };
$('save-text').onclick = async () => {
  if (locked() || !ready) return;
  if (!$('erase-confirm').checked) { status('기존 녹음 삭제 동의에 체크 필요'); return; }
  const input = $('text-input').value.replace(/\r\n?/g, '\n').trim();
  const newline = input.indexOf('\n');
  const nextTitle = (newline < 0 ? input : input.slice(0, newline)).trim();
  const verses = newline < 0 ? [] : input.slice(newline + 1).trim().split(/\n\s*\n/).map(v => v.trim());
  if (!nextTitle || nextTitle.length > 200 || !verses.length || verses.length > 500 || verses.some(v => !v || v.length > 10000) || JSON.stringify({title:nextTitle,verses}).length > 500000) { status('제목·절 형식/길이 확인 필요'); return; }
  busy = true; stopPlayback(); controls();
  try {
    const text = RelayStorage.connected ? await RelayStorage.request('saveText', {title: nextTitle, verses, revision}) : {title: nextTitle, verses};
    title = text.title; lines = text.verses; revision = text.revision; recordings = []; local.clear(); selected = 0;
    $('erase-confirm').checked = false; $('editor').open = false; status('본문 저장 완료 · 기존 녹음 초기화');
  } catch (err) { await failure(err); }
  finally { busy = false; render(); }
};
$('hold').addEventListener('pointerdown', start);
['pointerup','pointercancel','pointerleave'].forEach(type => $('hold').addEventListener(type, stop));
$('hold').addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', stop); document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); stopPlayback(); } });
$('all').onclick = () => { const first = lines.findIndex((_, i) => hasAudio(i)); if (first >= 0) play(first, true); else status('아직 녹음 없음'); };
$('stop-play').onclick = () => { stopPlayback(); status('재생 멈춤'); };
$('refresh').onclick = loadShared;
$('reader').value = RelayStorage.readerName;
$('identity').onsubmit = e => { e.preventDefault(); try { RelayStorage.setReaderName($('reader').value); status('이름 기억 완료'); } catch (err) { status(err.message); } };
$('disconnect').onclick = () => { if (locked()) return; try { RelayStorage.disconnect(); location.reload(); } catch (err) { status(err.message); } };
try { RelayStorage.acceptLink(location, history); } catch (err) { $('connection').textContent = err.message; }
ready = !RelayStorage.connected;
$('text-input').value = [title, ...lines].join('\n\n');
if (RelayStorage.connected) { $('refresh').hidden = false; $('disconnect').hidden = false; loadShared(); }
render();
