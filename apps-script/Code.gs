/* Script properties: DRIVE_FOLDER_ID, API_TOKEN. Audio never leaves Drive except API reads. */
var MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function doGet(e) { return respond_(e && e.parameter || {}, false); }
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents || '';
    if (raw.length > 15 * 1024 * 1024) fail_('INVALID_REQUEST', '요청이 너무 큼');
    return respond_(JSON.parse(raw), true);
  } catch (err) { return error_(err); }
}
function respond_(request, writable) {
  var lock;
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) fail_('INVALID_REQUEST', '요청 형식 오류');
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('API_TOKEN');
    var folderId = props.getProperty('DRIVE_FOLDER_ID');
    if (!token || !folderId) fail_('NOT_CONFIGURED', '스크립트 속성 설정 필요');
    if (request.token !== token) fail_('UNAUTHORIZED', '암호 확인 필요');
    var action = request.action;
    if (['getText', 'saveText', 'uploadRecording', 'listRecordings', 'getAudio'].indexOf(action) < 0) fail_('INVALID_REQUEST', '알 수 없는 action');
    if (!writable && (action === 'saveText' || action === 'uploadRecording')) fail_('INVALID_REQUEST', 'POST 필요');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) fail_('BUSY', '잠시 후 다시 시도');
    var folder = DriveApp.getFolderById(folderId);
    var stateFile = stateFile_(folder);
    var state = stateFile ? JSON.parse(stateFile.getBlob().getDataAsString('UTF-8')) : {text: {title: '', verses: [], updatedAt: null}, recordings: {}};
    var result;
    if (action === 'getText') result = state.text;
    if (action === 'listRecordings') result = {recordings: Object.keys(state.recordings).map(function(key) { return metadata_(state.recordings[key]); }).sort(function(a, b) { return a.verse - b.verse; })};
    if (action === 'getAudio') {
      var recording = state.recordings[verse_(request.verse, state)];
      if (!recording) fail_('NOT_FOUND', '녹음 없음');
      result = {mimeType: recording.mimeType, audioBase64: Utilities.base64Encode(DriveApp.getFileById(recording.fileId).getBlob().getBytes())};
    }
    if (action === 'saveText') {
      var title = string_(request.title, 200);
      if (!Array.isArray(request.verses) || !request.verses.length || request.verses.length > 500) fail_('INVALID_REQUEST', '절은 1~500개 필요');
      var verses = request.verses.map(function(v) { return string_(v, 5000); });
      var text = {title: title, verses: verses, updatedAt: new Date().toISOString()};
      if (Utilities.newBlob(JSON.stringify(text)).getBytes().length > 200 * 1024) fail_('INVALID_REQUEST', '본문이 너무 큼');
      var oldRecordings = state.recordings;
      if (title !== state.text.title || JSON.stringify(verses) !== JSON.stringify(state.text.verses)) state.recordings = {};
      state.text = text;
      saveState_(folder, stateFile, state);
      if (state.recordings !== oldRecordings) Object.keys(oldRecordings).forEach(function(key) { trash_(oldRecordings[key].fileId); });
      result = text;
    }
    if (action === 'uploadRecording') {
      var verse = verse_(request.verse, state);
      var reader = string_(request.reader, 80);
      var mime = typeof request.mimeType === 'string' ? request.mimeType.split(';')[0].trim().toLowerCase() : '';
      if (mime !== 'audio/webm' && mime !== 'audio/ogg') fail_('INVALID_REQUEST', 'webm/ogg만 지원');
      var encoded = request.audioBase64;
      if (typeof encoded !== 'string' || !encoded.length || encoded.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail_('INVALID_REQUEST', 'base64 형식/크기 오류');
      var bytes = Utilities.base64Decode(encoded);
      if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) fail_('INVALID_REQUEST', '녹음 크기 오류');
      var file = folder.createFile(Utilities.newBlob(bytes, mime, 'verse-' + verse + '-' + Utilities.getUuid() + (mime === 'audio/webm' ? '.webm' : '.ogg')));
      var old = state.recordings[verse];
      var item = {verse: verse, reader: reader, mimeType: mime, recordedAt: new Date().toISOString(), fileId: file.getId()};
      state.recordings[verse] = item;
      try { saveState_(folder, stateFile, state); } catch (err) { trash_(file.getId()); throw err; }
      if (old) trash_(old.fileId);
      result = metadata_(item);
    }
    return json_({ok: true, data: result});
  } catch (err) { return error_(err); }
  finally { if (lock) lock.releaseLock(); }
}
function stateFile_(folder) {
  var files = folder.getFilesByName('relay-reading-state.json');
  var file = files.hasNext() ? files.next() : null;
  if (files.hasNext()) fail_('INTERNAL_ERROR', '상태 파일 중복: 관리자 확인 필요');
  return file;
}
function saveState_(folder, file, state) {
  var content = JSON.stringify(state);
  if (file) file.setContent(content);
  else folder.createFile('relay-reading-state.json', content, MimeType.PLAIN_TEXT);
}
function metadata_(item) {
  return {verse: item.verse, reader: item.reader, playbackUrl: ScriptApp.getService().getUrl() + '?action=getAudio&verse=' + item.verse, recordedAt: item.recordedAt, mimeType: item.mimeType};
}
function verse_(value, state) {
  var number = typeof value === 'number' ? value : (typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN);
  if (!Number.isInteger(number) || number < 1 || number > state.text.verses.length) fail_('INVALID_REQUEST', '본문의 절 번호 필요');
  return number;
}
function string_(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail_('INVALID_REQUEST', '문자열 길이/형식 오류');
  return value.trim();
}
function trash_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); }
  catch (err) { console.warn('이전 파일 정리 실패; Drive 휴지통 정리 필요'); }
}
function fail_(code, message) { var err = new Error(message); err.apiCode = code; throw err; }
function error_(err) { return json_({ok: false, error: {code: err.apiCode || 'INTERNAL_ERROR', message: err.apiCode ? err.message : '저장 서비스 오류; 관리자 확인 필요'}}); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
