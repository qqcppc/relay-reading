const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const files = new Map(); let seq = 0; let locked = false;
  const blob = (value, mime) => ({getBytes: () => [...Buffer.from(value)], getDataAsString: () => String(value)});
  const folder = {
    createFile(value, content) {
      const id = String(++seq); const name = typeof value === 'string' ? value : value.name;
      const file = {id, name, content: typeof value === 'string' ? content : value.bytes, trashed: false,
        getId() {return id;}, getBlob() {return blob(this.content);}, setContent(v) {this.content = v;}, setTrashed(v) {this.trashed = v;}};
      files.set(id, file); return file;
    },
    getFilesByName(name) {const list = [...files.values()].filter(f => f.name === name && !f.trashed); return {hasNext: () => list.length > 0, next: () => list.shift()};}
  };
  const context = vm.createContext({console, PropertiesService: {getScriptProperties: () => ({getProperty: key => ({API_TOKEN:'secret', DRIVE_FOLDER_ID:'folder'})[key]})},
    DriveApp: {getFolderById: () => folder, getFileById: id => {if (!files.has(id)) throw Error(); return files.get(id);}},
    LockService: {getScriptLock: () => ({tryLock: () => {locked = true; return true;}, releaseLock: () => {locked = false;}})},
    ScriptApp: {getService: () => ({getUrl: () => 'https://example.com/exec'})}, MimeType: {PLAIN_TEXT: 'text/plain'},
    ContentService: {MimeType: {JSON:'json'}, createTextOutput: content => ({setMimeType: () => content})},
    Utilities: {getUuid: () => String(seq), newBlob: (value, mime, name) => ({...blob(value, mime), bytes: Buffer.from(value), name}), base64Encode: value => Buffer.from(value).toString('base64'), base64Decode: value => [...Buffer.from(value, 'base64')]}
  });
  vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), context);
  return {files, call: (data, get = false) => JSON.parse(get ? context.doGet({parameter: data}) : context.doPost({postData:{contents: JSON.stringify({token:'secret', ...data})}})), context, locked: () => locked};
}
test('본문 저장, 녹음 교체, 조회, 음성 복원 및 본문 변경 정리', () => {
  const s = setup();
  assert.deepEqual(s.call({action:'getText'}).data.verses, []);
  assert.equal(s.call({action:'saveText', title:'제목', verses:['하나', '둘']}).ok, true);
  const upload = {action:'uploadRecording', verse:1, reader:'민수', mimeType:'audio/webm;codecs=opus', audioBase64:Buffer.from('test audio').toString('base64')};
  assert.equal(s.call(upload).ok, true);
  assert.equal(s.call({...upload, reader:'지수', mimeType:'audio/ogg'}).ok, true);
  const list = s.call({action:'listRecordings'}).data.recordings;
  assert.equal(list.length, 1); assert.equal(list[0].reader, '지수'); assert.equal(list[0].mimeType, 'audio/ogg');
  assert.equal(Buffer.from(s.call({action:'getAudio', verse:1}).data.audioBase64, 'base64').toString(), 'test audio');
  assert.equal([...s.files.values()].filter(f => f.trashed).length, 1);
  s.call({action:'saveText', title:'제목', verses:['하나', '둘']});
  assert.equal(s.call({action:'listRecordings'}).data.recordings.length, 1);
  s.call({action:'saveText', title:'새 제목', verses:['새 절']});
  assert.equal(s.call({action:'listRecordings'}).data.recordings.length, 0);
  assert.equal(s.call({action:'getAudio', verse:1}).error.code, 'NOT_FOUND');
  assert.equal(s.locked(), false);
});
test('인증, GET 쓰기 차단, 입력 오류 및 잘못된 JSON', () => {
  const s = setup();
  assert.equal(s.call({action:'getText',token:'wrong'}).error.code, 'UNAUTHORIZED');
  assert.equal(s.call({action:'saveText',token:'secret'}, true).error.code, 'INVALID_REQUEST');
  s.call({action:'saveText',title:'제목',verses:['절']});
  const valid = {action:'uploadRecording',verse:1,reader:'이름',mimeType:'audio/webm',audioBase64:'YQ=='};
  for (const change of [{verse:2}, {verse:true}, {reader:''}, {mimeType:'text/html'}, {audioBase64:'bad!'}, {audioBase64:''}]) {
    assert.equal(s.call({...valid,...change}).error.code, 'INVALID_REQUEST');
  }
  assert.equal(s.call({action:'saveText',title:'제목',verses:[]}).error.code, 'INVALID_REQUEST');
  assert.equal(JSON.parse(s.context.doPost({postData:{contents:'{'}})).ok, false);
  assert.equal(s.locked(), false);
});
