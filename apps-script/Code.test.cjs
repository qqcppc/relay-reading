const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function server() {
  let next = 0;
  const files = new Map();
  const props = { API_KEY: 'test-key', DRIVE_FOLDER_ID: 'folder' };
  const blob = (bytes, mime) => ({ getBytes: () => [...bytes],
    getDataAsString: () => Buffer.from(bytes).toString('utf8'), mime });
  const folder = { createFile(name, content) {
    const id = String(++next);
    const file = { id, trashed: false, data: typeof name === 'string' ? blob(Buffer.from(content)) : name,
      getId: () => id, getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
      getBlob() { return this.data; }, setContent(s) { this.data = blob(Buffer.from(s)); },
      setSharing() {}, setTrashed(v) { this.trashed = v; } };
    files.set(id, file); return file;
  } };
  const context = vm.createContext({ console, PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props[k], setProperty: (k, v) => { props[k] = v; }
  }) }, DriveApp: { getFolderById: () => folder, getFileById: id => files.get(id),
    Access: { PRIVATE: 'private' }, Permission: { VIEW: 'view' } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'uuid-' + (++next),
      newBlob: (b, mime) => blob(b, mime), base64Decode: s => [...Buffer.from(s, 'base64')],
      base64Encode: b => Buffer.from(b).toString('base64') }, MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({
      setMimeType: () => JSON.parse(text)
    }) }
  });
  vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), context);
  return { files, context, call: data => context.doPost({ postData: {
    contents: JSON.stringify({ key: 'test-key', ...data })
  } }) };
}

test('본문, 재녹음 교체, 다른 기기 음성 조회, 오래된 버전 거부', () => {
  const s = server();
  assert.equal(s.call({ action: 'getText' }).data.revision, '0');
  const text = s.call({ action: 'saveText', revision: '0', title: '시험', verses: ['하나', '둘'] }).data;
  // Synthetic container bytes only: no recorded audio files are created.
  const audio = Buffer.from([26, 69, 223, 163, 0, 1]).toString('base64');
  const request = { action: 'uploadRecording', revision: text.revision, verse: 1,
    readerName: '민수', mimeType: 'audio/webm;codecs=opus', audioBase64: audio };
  assert.equal(s.call(request).ok, true);
  const first = [...s.files.values()].find(f => f.data.mime === 'audio/webm');
  assert.equal(s.call({ ...request, readerName: '영희' }).data.readerName, '영희');
  assert.equal(first.trashed, true);
  assert.equal(s.call({ action: 'getAudio', revision: text.revision, verse: 1 }).data.audioBase64, audio);
  assert.equal(s.call({ action: 'listRecordings' }).data.recordings.length, 1);
  assert.equal(s.call({ action: 'getAudio', revision: text.revision, verse: 2 }).error.code, 'NOT_FOUND');
  assert.equal(s.call({ ...request, audioBase64: 'AAAA' }).error.code, 'INVALID_REQUEST');
  assert.equal(s.call({ ...request, verse: 0 }).error.code, 'INVALID_REQUEST');
  assert.equal(s.call({ ...request, mimeType: 'audio/mp4' }).error.code, 'INVALID_REQUEST');
  const ogg = Buffer.from('OggSsynthetic').toString('base64');
  assert.equal(s.call({ ...request, verse: 2, mimeType: 'audio/ogg', audioBase64: ogg }).ok, true);
  assert.equal(s.call({ action: 'saveText', revision: text.revision, title: '다음', verses: ['새 절'] }).ok, true);
  assert.equal(s.call(request).error.code, 'CONFLICT');
  assert.equal(s.call({ action: 'listRecordings' }).data.recordings.length, 0);
  assert.equal([...s.files.values()].filter(f => f.data.mime && !f.trashed).length, 0);
});

test('인증·형식 검사, GET 쓰기 거부', () => {
  const s = server();
  assert.equal(s.call({ action: 'getText', key: 'wrong' }).error.code, 'UNAUTHORIZED');
  assert.equal(s.context.doPost({ postData: { contents: '{' } }).error.code, 'INVALID_REQUEST');
  assert.equal(s.context.doGet({ parameter: { action: 'saveText' } }).error.code, 'INVALID_REQUEST');
  assert.equal(s.context.doGet({ parameter: { action: 'getText', key: 'test-key' } }).ok, true);
  assert.equal(s.call({ action: 'saveText', revision: '0', title: ' ', verses: ['a'] }).error.code, 'INVALID_REQUEST');
});

test('페이지 경계 저장·조회와 잘못된 경계 거부, 구형 요청 호환', () => {
  const s = server();
  for (const pageStarts of [[1], [0, 0], [0, 3], [0, -1], [0, 1.5]]) {
    assert.equal(s.call({action:'saveText',revision:'0',title:'제목',verses:['a','b','c'],pageStarts}).error.code,'INVALID_REQUEST');
  }
  const text=s.call({action:'saveText',revision:'0',title:'제목',verses:['a','b','c'],pageStarts:[0,2]}).data;
  assert.deepEqual(text.pageStarts,[0,2]);
  assert.deepEqual(s.call({action:'getText'}).data.pageStarts,[0,2]);
  assert.deepEqual(s.call({action:'saveText',revision:text.revision,title:'구형',verses:['a']}).data.pageStarts,[0]);
});
