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
  return { props, files, context, call: data => context.doPost({ postData: {
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

test('장 제목·시작 절 번호 보존과 잘못된 메타데이터 거부', () => {
  const s=server();
  const request={action:'saveText',revision:'0',title:'본문',verses:['a','b'],pageStarts:[0,1]};
  for(const chapters of [[],[{title:'장',startVerse:0},{title:'장',startVerse:2}],[{title:'',startVerse:1},{title:'장',startVerse:2}]]) {
    assert.equal(s.call({...request,chapters}).error.code,'INVALID_REQUEST');
  }
  const chapters=[{title:'첫 장',startVerse:10},{title:'다음 장',startVerse:20}];
  assert.deepEqual(s.call({...request,chapters}).data.chapters,chapters);
  assert.deepEqual(s.call({action:'getText'}).data.chapters,chapters);
});

test('66권 책 구조 저장·조회, 구형 요청 호환과 경계 검사',()=>{
 const s=server();const verses=Array.from({length:66},(_,i)=>'줄'+i),pageStarts=verses.map((_,i)=>i),books=verses.map((_,i)=>({title:'책'+i,startChapter:i}));
 for(const invalid of [[],[{title:'a',startChapter:1}],[{title:'a',startChapter:0},{title:'b',startChapter:0}],[{title:'a',startChapter:0},{title:'b',startChapter:66}]]){
 assert.equal(s.call({action:'saveText',revision:'0',title:'본문',verses,pageStarts,books:invalid}).error.code,'INVALID_REQUEST');}
 const text=s.call({action:'saveText',revision:'0',title:'본문',verses,pageStarts,books}).data;
 assert.deepEqual(text.books,books);assert.deepEqual(s.call({action:'getText'}).data.books,books);
 assert.deepEqual(s.call({action:'saveText',revision:text.revision,title:'구형',verses:['a']}).data.books,[{title:'구형',startChapter:0}]);
});

test('F2: phone contention, renewal, expiry, owner-only replacement, OFF compatibility',()=>{
 const s=server();let now=1000000;s.context.Date=class extends Date {static now(){return now}};
 const text=s.call({action:'saveText',revision:'0',title:'본문',verses:['a','b']}).data;
 const base={revision:text.revision,verse:1,readerName:'민수'};
 assert.equal(s.call({action:'acquireLock',...base}).error.code,'FEATURE_DISABLED');
 s.props.F2_ENABLED='true';
 const a=s.call({action:'acquireLock',...base}).data;
 assert.equal(s.call({action:'acquireLock',...base,readerName:'지수'}).error.code,'LOCKED');
 assert.equal(s.call({action:'acquireLock',...base}).error.code,'LOCKED');
 const publicLocks=s.call({action:'listLocks'}).data;assert.equal(publicLocks.locks.length,1);assert.equal('leaseToken' in publicLocks.locks[0],false);
 now+=30000;const renewed=s.call({action:'renewLock',...base,leaseToken:a.leaseToken}).data;assert(renewed.expiresAt>a.expiresAt);
 const upload={action:'uploadRecording',...base,mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64')};
 assert.equal(s.call(upload).error.code,'LOCK_EXPIRED');
 assert.equal(s.call({...upload,leaseToken:a.leaseToken}).ok,true);assert.equal(s.call({action:'listLocks'}).data.locks.length,0);
 assert.equal(s.call({action:'acquireLock',...base,readerName:'지수'}).error.code,'FORBIDDEN');
 const b=s.call({action:'acquireLock',...base}).data;
 assert.equal(s.call({...upload,leaseToken:b.leaseToken,readerName:'지수'}).error.code,'FORBIDDEN');
 now+=120001;assert.equal(s.call({action:'listLocks'}).data.locks.length,0);
 assert.equal(s.call({...upload,leaseToken:b.leaseToken}).error.code,'LOCK_EXPIRED');
 const c=s.call({action:'acquireLock',...base}).data;
 s.call({action:'releaseLock',...base,leaseToken:'wrong'});assert.equal(s.call({action:'listLocks'}).data.locks.length,1);
 s.call({action:'releaseLock',...base,leaseToken:c.leaseToken});assert.equal(s.call({action:'listLocks'}).data.locks.length,0);
 s.props.F2_ENABLED='false';assert.equal(s.call({...upload,readerName:'지수'}).ok,true);
});
