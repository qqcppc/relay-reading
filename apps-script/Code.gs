/** One private Drive folder and one shared key per deployment. */
var MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function doGet(e) {
  return respond_(function () {
    var request = (e && e.parameter) || {};
    if (['getText', 'listRecordings'].indexOf(request.action) < 0) {
      fail_('INVALID_REQUEST', 'GET은 본문·목록 조회만 가능함');
    }
    return dispatch_(request);
  });
}

function doPost(e) {
  return respond_(function () {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 7200000) fail_('INVALID_REQUEST', '요청 크기 초과 또는 빈 요청');
    var request;
    try { request = JSON.parse(raw); }
    catch (_) { fail_('INVALID_REQUEST', 'JSON 형식 오류'); }
    return dispatch_(request);
  });
}

function respond_(operation) {
  var result;
  try { result = { ok: true, data: operation() }; }
  catch (error) {
    result = { ok: false, error: {
      code: error.apiCode || 'INTERNAL_ERROR',
      message: error.apiCode ? error.message : '저장 서버 오류. 배포자가 실행 기록 확인 필요'
    } };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    fail_('INVALID_REQUEST', '요청 객체 필요');
  }
  var properties = PropertiesService.getScriptProperties();
  var key = properties.getProperty('API_KEY');
  var folderId = properties.getProperty('DRIVE_FOLDER_ID');
  if (!key || !folderId) fail_('NOT_CONFIGURED', 'API_KEY와 DRIVE_FOLDER_ID 설정 필요');
  if (request.key !== key) fail_('UNAUTHORIZED', '공유키 확인 필요');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY', '잠시 후 재시도');
  try {
    var folder = DriveApp.getFolderById(folderId);
    var fileId = properties.getProperty('STATE_FILE_ID');
    var stateFile = fileId ? DriveApp.getFileById(fileId) : null;
    var state = stateFile ? JSON.parse(stateFile.getBlob().getDataAsString('UTF-8')) : {
      title: '', verses: [], revision: '0', recordings: {}
    };
    if (request.action === 'getText') return text_(state);
    if (request.action === 'listRecordings') {
      return { revision: state.revision, recordings: Object.keys(state.recordings)
        .sort(function (a, b) { return Number(a) - Number(b); })
        .map(function (verse) { return recording_(state.recordings[verse]); }) };
    }
    if (['saveText', 'uploadRecording', 'getAudio'].indexOf(request.action) < 0) {
      fail_('INVALID_REQUEST', '지원하지 않는 action');
    }
    if (request.revision !== state.revision) fail_('CONFLICT', '본문을 다시 조회한 뒤 재시도');
    if (request.action === 'saveText') {
      var title = string_(request.title, 200, '제목');
      if (!Array.isArray(request.verses) || !request.verses.length || request.verses.length > 500) {
        fail_('INVALID_REQUEST', '절은 1~500개 필요');
      }
      var verses = request.verses.map(function (v) { return string_(v, 10000, '절'); });
      if (JSON.stringify({ title: title, verses: verses }).length > 500000) {
        fail_('INVALID_REQUEST', '본문 크기 초과');
      }
      var pageStarts = request.pageStarts === undefined ? [0] : request.pageStarts;
      if (!Array.isArray(pageStarts) || !pageStarts.length || pageStarts[0] !== 0 ||
          pageStarts.some(function (start, index) {
            return !Number.isInteger(start) || start < 0 || start >= verses.length ||
              (index > 0 && start <= pageStarts[index - 1]);
          })) fail_('INVALID_REQUEST', '페이지 시작 위치 오류');
      var chapters = request.chapters === undefined ? pageStarts.map(function (start, index) {
        return {title: (index + 1) + '장', startVerse: start + 1};
      }) : request.chapters;
      if (!Array.isArray(chapters) || chapters.length !== pageStarts.length) fail_('INVALID_REQUEST', '장 정보 개수 오류');
      chapters = chapters.map(function (chapter) {
        if (!chapter || !Number.isInteger(chapter.startVerse) || chapter.startVerse < 1 || chapter.startVerse > 1000000) fail_('INVALID_REQUEST', '시작 절 번호 오류');
        return {title: string_(chapter.title, 80, '장 제목'), startVerse: chapter.startVerse};
      });
      var books = request.books === undefined ? [{title:title.slice(0, 80), startChapter:0}] : request.books;
      if (!Array.isArray(books) || !books.length || books.length > pageStarts.length) fail_('INVALID_REQUEST', '책 정보 개수 오류');
      books = books.map(function (book, index) {
        if (!book || !Number.isInteger(book.startChapter) || book.startChapter < 0 || book.startChapter >= pageStarts.length ||
            (index === 0 && book.startChapter !== 0) || (index > 0 && book.startChapter <= books[index - 1].startChapter)) fail_('INVALID_REQUEST', '책 시작 장 오류');
        return {title:string_(book.title, 80, '책 제목'), startChapter:book.startChapter};
      });
      var previous = state.recordings;
      state = { title: title, verses: verses, pageStarts: pageStarts, chapters: chapters, books: books, revision: Utilities.getUuid(), recordings: {} };
      persist_(folder, properties, stateFile, state);
      Object.keys(previous).forEach(function (v) { trash_(previous[v].fileId); });
      return text_(state);
    }
    var verse = request.verse;
    if (!Number.isInteger(verse) || verse < 1 || verse > state.verses.length) {
      fail_('INVALID_REQUEST', '현재 본문의 절 번호 필요');
    }
    var old = state.recordings[verse];
    if (request.action === 'getAudio') {
      if (!old) fail_('NOT_FOUND', '아직 녹음하지 않은 절');
      return { mimeType: old.mimeType,
        audioBase64: Utilities.base64Encode(DriveApp.getFileById(old.fileId).getBlob().getBytes()) };
    }
    var readerName = string_(request.readerName, 80, '읽은 사람 이름');
    var mime = typeof request.mimeType === 'string' ? request.mimeType.split(';')[0].trim().toLowerCase() : '';
    if (['audio/webm', 'audio/ogg'].indexOf(mime) < 0) fail_('INVALID_REQUEST', 'webm/ogg만 지원');
    var encoded = request.audioBase64;
    if (typeof encoded !== 'string' || !encoded.length ||
        encoded.length > 4 * Math.ceil(MAX_AUDIO_BYTES / 3) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      fail_('INVALID_REQUEST', 'Base64 형식 또는 파일 크기 오류');
    }
    var bytes = Utilities.base64Decode(encoded);
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) fail_('INVALID_REQUEST', '파일 크기 초과');
    // Verify the container signature, not just the client-supplied MIME type.
    var signature = bytes.slice(0, 4).map(function (b) { return b & 255; }).join(',');
    if (signature !== (mime === 'audio/webm' ? '26,69,223,163' : '79,103,103,83')) {
      fail_('INVALID_REQUEST', '음성 컨테이너 형식 불일치');
    }
    var file = folder.createFile(Utilities.newBlob(bytes, mime,
      'verse-' + verse + '-' + Utilities.getUuid() + (mime === 'audio/webm' ? '.webm' : '.ogg')));
    try {
      // Dedicated folder must be private; never enable public link sharing here.
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      state.recordings[verse] = { verse: verse, readerName: readerName,
        fileId: file.getId(), playbackUrl: file.getUrl(), mimeType: mime,
        recordedAt: new Date().toISOString() };
      persist_(folder, properties, stateFile, state);
    } catch (error) {
      trash_(file.getId());
      throw error;
    }
    if (old) trash_(old.fileId);
    return recording_(state.recordings[verse]);
  } finally { lock.releaseLock(); }
}

function persist_(folder, properties, file, state) {
  var json = JSON.stringify(state);
  if (file) { file.setContent(json); return; }
  var created = folder.createFile('relay-reading-state.json', json, MimeType.PLAIN_TEXT);
  try { properties.setProperty('STATE_FILE_ID', created.getId()); }
  catch (error) { trash_(created.getId()); throw error; }
}

function trash_(fileId) {
  // Committed state remains authoritative even when old-file cleanup fails.
  try { DriveApp.getFileById(fileId).setTrashed(true); }
  catch (_) { console.warn('이전 파일 정리 실패: Drive에서 수동 정리 필요'); }
}

function text_(state) {
  return { books: state.books || [{title:state.title.slice(0, 80) || '본문', startChapter:0}], title: state.title, verses: state.verses, pageStarts: state.pageStarts || [0], chapters: state.chapters || (state.pageStarts || [0]).map(function (start, index) { return {title: (index + 1) + '장', startVerse: start + 1}; }), revision: state.revision };
}

function recording_(value) {
  return { verse: value.verse, readerName: value.readerName,
    playbackUrl: value.playbackUrl, recordedAt: value.recordedAt };
}

function string_(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    fail_('INVALID_REQUEST', label + ' 입력값 확인 필요');
  }
  return value.trim();
}

function fail_(code, message) {
  var error = new Error(message);
  error.apiCode = code;
  throw error;
}
