const { test } = require('node:test');
const assert = require('node:assert/strict');

const {server}=require('../tests/helpers/apps-script.cjs');

test('본문, 재녹음 교체, 다른 기기 음성 조회, 오래된 버전 거부', () => {
  const s = server();
  assert.equal(s.call({ action: 'getText' }).data.revision, '0');
  const text = s.admin({ action: 'saveText', revision: '0', title: '시험', verses: ['하나', '둘'] }).data;
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
  assert.equal(s.admin({ action: 'saveText', revision: text.revision, title: '다음', verses: ['새 절'] }).ok, true);
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
  assert.equal(s.admin({ action: 'saveText', revision: '0', title: ' ', verses: ['a'] }).error.code, 'INVALID_REQUEST');
});

test('페이지 경계 저장·조회와 잘못된 경계 거부, 구형 요청 호환', () => {
  const s = server();
  for (const pageStarts of [[1], [0, 0], [0, 3], [0, -1], [0, 1.5]]) {
    assert.equal(s.admin({action:'saveText',revision:'0',title:'제목',verses:['a','b','c'],pageStarts}).error.code,'INVALID_REQUEST');
  }
  const text=s.admin({action:'saveText',revision:'0',title:'제목',verses:['a','b','c'],pageStarts:[0,2]}).data;
  assert.deepEqual(text.pageStarts,[0,2]);
  assert.deepEqual(s.call({action:'getText'}).data.pageStarts,[0,2]);
  assert.deepEqual(s.admin({action:'saveText',revision:text.revision,title:'구형',verses:['a']}).data.pageStarts,[0]);
});

test('장 제목·시작 절 번호 보존과 잘못된 메타데이터 거부', () => {
  const s=server();
  const request={action:'saveText',revision:'0',title:'본문',verses:['a','b'],pageStarts:[0,1]};
  for(const chapters of [[],[{title:'장',startVerse:0},{title:'장',startVerse:2}],[{title:'',startVerse:1},{title:'장',startVerse:2}]]) {
    assert.equal(s.admin({...request,chapters}).error.code,'INVALID_REQUEST');
  }
  const chapters=[{title:'첫 장',startVerse:10},{title:'다음 장',startVerse:20}];
  assert.deepEqual(s.admin({...request,chapters}).data.chapters,chapters);
  assert.deepEqual(s.call({action:'getText'}).data.chapters,chapters);
});

test('66권 책 구조 저장·조회, 구형 요청 호환과 경계 검사',()=>{
 const s=server();const verses=Array.from({length:66},(_,i)=>'줄'+i),pageStarts=verses.map((_,i)=>i),books=verses.map((_,i)=>({title:'책'+i,startChapter:i}));
 for(const invalid of [[],[{title:'a',startChapter:1}],[{title:'a',startChapter:0},{title:'b',startChapter:0}],[{title:'a',startChapter:0},{title:'b',startChapter:66}]]){
 assert.equal(s.admin({action:'saveText',revision:'0',title:'본문',verses,pageStarts,books:invalid}).error.code,'INVALID_REQUEST');}
 const text=s.admin({action:'saveText',revision:'0',title:'본문',verses,pageStarts,books}).data;
 assert.deepEqual(text.books,books);assert.deepEqual(s.call({action:'getText'}).data.books,books);
 assert.deepEqual(s.admin({action:'saveText',revision:text.revision,title:'구형',verses:['a']}).data.books,[{title:'구형',startChapter:0}]);
});

test('F2: phone contention, renewal, expiry, owner-only replacement, OFF compatibility',()=>{
 const s=server();let now=1000000;s.context.Date=class extends Date {static now(){return now}};
 const text=s.admin({action:'saveText',revision:'0',title:'본문',verses:['a','b']}).data;
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

test('F5: shared assignments, independent edit revision, validation and text reset',()=>{
 const s=server();const text=s.admin({action:'saveText',revision:'0',title:'본문',verses:['a','b','c']}).data;
 const empty=s.call({action:'getAssignments'}).data;assert.deepEqual(empty.assignments,{});
 s.call({action:'uploadRecording',revision:text.revision,verse:1,readerName:'민수',mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64')});
 const request={action:'saveAssignments',revision:text.revision,assignmentRevision:empty.assignmentRevision,assignments:{1:'민수',2:'지수',3:'민수'}};
 const saved=s.call(request);assert.equal(saved.ok,true);assert.equal(s.call({action:'getText'}).data.revision,text.revision);assert.equal(s.call({action:'listRecordings'}).data.recordings.length,1);assert.deepEqual(s.call({action:'getAssignments'}).data.assignments,request.assignments);
 assert.equal(s.call(request).error.code,'CONFLICT');
 for(const assignments of [{4:'이름'},{1:''},{'__bad':'이름'},[]])assert.equal(s.call({...request,assignmentRevision:saved.data.assignmentRevision,assignments}).error.code,'INVALID_REQUEST');
 assert.equal(s.call({...request,revision:'wrong',assignmentRevision:saved.data.assignmentRevision}).error.code,'CONFLICT');
 assert.equal(s.admin({action:'saveText',revision:text.revision,title:'새 본문',verses:['a']}).ok,true);assert.deepEqual(s.call({action:'getAssignments'}).data.assignments,{});
});

test('F9: grouped upload keys/ranges, consent to regroup, unaffected audio and stale uploads',()=>{
 const s=server();let text=s.admin({action:'saveText',revision:'0',title:'묶음',verses:['a','b','c','d'],pageStarts:[0],groups:[{start:1,end:2}]}).data;
 const audio=Buffer.from([26,69,223,163,1]).toString('base64');const upload={action:'uploadRecording',revision:text.revision,readerName:'민수',mimeType:'audio/webm',audioBase64:audio};
 assert.equal(s.call({...upload,verse:1}).error.code,'INVALID_REQUEST');assert.equal(s.call({...upload,verse:2,endVerse:2}).error.code,'INVALID_REQUEST');
 assert.equal(s.call({...upload,verse:1,endVerse:2}).data.endVerse,2);assert.equal(s.call({...upload,verse:4}).ok,true);
 assert.equal(s.call({action:'getAudio',revision:text.revision,verse:1}).data.audioBase64,audio);assert.equal(s.call({action:'getAudio',revision:text.revision,verse:2}).error.code,'NOT_FOUND');
 const noop=s.admin({action:'saveGroups',revision:text.revision,groups:[{start:1,end:2}]}).data;assert.equal(noop.text.revision,text.revision);assert.equal(noop.recordings.length,2);
 assert.equal(s.admin({action:'saveGroups',revision:text.revision,groups:[]}).error.code,'RECORDINGS_EXIST');assert.equal(s.call({action:'listRecordings'}).data.recordings.length,2);
 const split=s.admin({action:'saveGroups',revision:text.revision,groups:[],discardRecordings:true}).data;assert.equal(split.recordings.length,1);assert.equal(split.recordings[0].verse,4);assert.notEqual(split.text.revision,text.revision);
 assert.equal(s.call({...upload,verse:1,endVerse:2}).error.code,'CONFLICT');
});
test('F9: chapter/overlap validation, shared assignments and group-wide F2 leases',()=>{
 const s=server();let text=s.admin({action:'saveText',revision:'0',title:'본문',verses:['a','b','c','d'],pageStarts:[0,3]}).data;
 for(const groups of [[{start:1,end:4}],[{start:1,end:1}],[{start:1,end:2},{start:2,end:3}]])assert.equal(s.admin({action:'saveGroups',revision:text.revision,groups}).error.code,'INVALID_REQUEST');
 const plan=s.call({action:'getAssignments'}).data;s.call({action:'saveAssignments',revision:text.revision,assignmentRevision:plan.assignmentRevision,assignments:{1:'민수',2:'지수',3:'도윤'}});
 text=s.admin({action:'saveGroups',revision:text.revision,groups:[{start:1,end:3}]}).data.text;
 let assignments=s.call({action:'getAssignments'}).data;assert.deepEqual(assignments.assignments,{1:'민수',2:'민수',3:'민수'});
 assert.equal(s.call({action:'saveAssignments',revision:text.revision,assignmentRevision:assignments.assignmentRevision,assignments:{1:'민수',2:'지수',3:'민수'}}).error.code,'INVALID_REQUEST');
 s.props.F2_ENABLED='true';const lease=s.call({action:'acquireLock',revision:text.revision,verse:1,readerName:'민수'}).data;assert.equal(lease.endVerse,3);
 assert.equal(s.call({action:'listLocks'}).data.locks[0].endVerse,3);assert.equal(s.call({action:'acquireLock',revision:text.revision,verse:2,readerName:'지수'}).error.code,'INVALID_REQUEST');
 assert.equal(s.call({action:'acquireLock',revision:text.revision,verse:1,readerName:'지수'}).error.code,'LOCKED');
 const audio=Buffer.from([26,69,223,163,1]).toString('base64');assert.equal(s.call({action:'uploadRecording',revision:text.revision,verse:1,endVerse:3,readerName:'민수',leaseToken:lease.leaseToken,mimeType:'audio/webm',audioBase64:audio}).ok,true);
 assert.equal(s.call({action:'listLocks'}).data.locks.length,0);
});

test('F10 accepts canonical WAV, rejects forged sizes/headers',()=>{const s=server(),text=s.admin({action:'saveText',revision:'0',title:'wav',verses:['one']}).data;
 const b=Buffer.alloc(48);b.write('RIFF');b.writeUInt32LE(40,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);
 const request={action:'uploadRecording',revision:text.revision,verse:1,readerName:'나',mimeType:'audio/wav',audioBase64:b.toString('base64')};assert.equal(s.call(request).ok,true);b.writeUInt32LE(123,40);assert.equal(s.call({...request,audioBase64:b.toString('base64')}).error.code,'INVALID_REQUEST');
});

test('F11 retry is idempotent after lost reply, never overwrites a changed recording',()=>{const s=server(),text=s.admin({action:'saveText',revision:'0',title:'queue',verses:['one']}).data;
 const upload={action:'uploadRecording',revision:text.revision,verse:1,readerName:'나',mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64'),uploadId:'queued-0001',expectedPrevious:null};
 const first=s.call(upload).data;assert.equal(first.uploadId,'queued-0001');const size=s.files.size;s.props.F2_ENABLED='true';assert.equal(s.call(upload).data.playbackUrl,first.playbackUrl);assert.equal(s.files.size,size);s.props.F2_ENABLED='false';
 const next=s.call({...upload,uploadId:'queued-0002',expectedPrevious:first.playbackUrl}).data;assert.notEqual(next.playbackUrl,first.playbackUrl);assert.equal(s.call(upload).error.code,'CONFLICT');assert.equal(s.call({...upload,revision:'old'}).error.code,'CONFLICT');
});

test('Device deletion proves token and name, skips foreign/legacy, keeps secret hashes private',()=>{
 const s=server(),text=s.admin({action:'saveText',revision:'0',title:'기기 예시',verses:['예시 하나','예시 둘','예시 셋']}).data,device={deviceId:'device-alpha',deviceToken:'a'.repeat(64)},other={deviceId:'device-bravo',deviceToken:'b'.repeat(64)};
 const upload=(verse,fields)=>s.call({action:'uploadRecording',revision:text.revision,verse,readerName:'나',mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64'),...fields}).data;
 const a=upload(1,device),b=upload(2,other),legacy=upload(3,{});assert.equal(a.deviceId,device.deviceId);assert.equal(a.deviceHash,undefined);assert.equal(a.deviceToken,undefined);
 const remove=fields=>s.call({action:'deleteRecordings',revision:text.revision,readerName:'나',...device,targets:[a,b,legacy].map(r=>({verse:r.verse,playbackUrl:r.playbackUrl})),...fields});
 assert.equal(remove({deviceToken:'c'.repeat(64)}).data.deleted.length,0);assert.equal(remove({readerName:'다른 이름'}).data.deleted.length,0);
 const result=remove({}).data;assert.deepEqual(result.deleted,[1]);assert.deepEqual(result.skipped,[2,3]);assert.equal(result.recordings.length,2);assert.equal(s.call({action:'getText'}).data.revision,text.revision);
});
test('Owned deletion rejects stale replacement or active lease atomically',()=>{
 const s=server(),text=s.admin({action:'saveText',revision:'0',title:'충돌 예시',verses:['예시 하나','예시 둘']}).data,device={deviceId:'device-alpha',deviceToken:'a'.repeat(64)};
 const upload=verse=>s.call({action:'uploadRecording',revision:text.revision,verse,readerName:'나',...device,mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64')}).data;
 const a=upload(1),b=upload(2);upload(2);const fields={action:'deleteRecordings',revision:text.revision,readerName:'나',...device,targets:[a,b].map(r=>({verse:r.verse,playbackUrl:r.playbackUrl}))};assert.equal(s.call(fields).error.code,'CONFLICT');assert.equal(s.call({action:'listRecordings'}).data.recordings.length,2);
 s.props.F2_ENABLED='true';s.call({action:'acquireLock',revision:text.revision,verse:1,readerName:'나',...device});assert.equal(s.call({...fields,targets:[fields.targets[0]]}).error.code,'LOCKED');assert.equal(s.call({...fields,revision:'stale'}).error.code,'CONFLICT');assert.equal(s.call({action:'listRecordings'}).data.recordings.length,2);
});
test('Bound recordings cannot be replaced by a spoofed device or name even with F2 OFF',()=>{
 const s=server(),text=s.admin({action:'saveText',revision:'0',title:'기기 예시',verses:['예시 하나']}).data,fields={action:'uploadRecording',revision:text.revision,verse:1,readerName:'나',deviceId:'device-alpha',deviceToken:'a'.repeat(64),mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64')};assert.equal(s.call(fields).ok,true);
 for(const changed of [{deviceToken:'b'.repeat(64)},{readerName:'다른 이름'},{deviceId:'device-other'}])assert.equal(s.call({...fields,...changed}).error.code,'FORBIDDEN');assert.equal(s.call(fields).ok,true);
});

test('ADMIN_KEY gates destructive text/group writes and private checks, missing config fails closed',()=>{
 const s=server();for(const action of ['saveText','saveGroups','resolveSoundCheck','listSoundChecks'])for(const adminKey of [undefined,'wrong'])assert.equal(s.call({action,adminKey,revision:'wrong'}).error.code,'ADMIN_REQUIRED');
 assert.equal(s.call({action:'getText'}).data.revision,'0');assert.equal(s.call({action:'getAccess'}).data.admin,false);assert.equal(s.admin({action:'getAccess'}).data.admin,true);
 const t=s.admin({action:'saveText',revision:'0',title:'권한 예시',verses:['예시 하나','예시 둘']});assert.equal(t.ok,true);assert.equal(s.admin({action:'saveGroups',revision:t.data.revision,groups:[{start:1,end:2}]}).ok,true);
 delete s.props.ADMIN_KEY;assert.equal(s.call({action:'getAccess'}).data.configured,false);for(const action of ['saveText','saveGroups','listSoundChecks'])assert.equal(s.admin({action}).error.code,'NOT_CONFIGURED');assert.equal(s.call({action:'getText'}).ok,true);
});
test('Sound checks are private, deduplicated, stale-safe and resolved only by verified ADMIN_KEY',()=>{
 const s=server(),text=s.admin({action:'saveText',revision:'0',title:'점검 예시',verses:['예시 하나','예시 둘']}).data,device={deviceId:'device-alpha',deviceToken:'a'.repeat(64)},other={deviceId:'device-bravo',deviceToken:'b'.repeat(64)};
 const upload=verse=>s.call({action:'uploadRecording',revision:text.revision,verse,readerName:'나',...device,mimeType:'audio/webm',audioBase64:Buffer.from([26,69,223,163,1]).toString('base64')}).data;
 const a=upload(1),b=upload(2),request={action:'createSoundCheck',revision:text.revision,readerName:'친구',...other,reason:'cut',targets:[{verse:a.verse,playbackUrl:a.playbackUrl}]};
 assert.equal(s.call({...request,reason:'bad'}).error.code,'INVALID_REQUEST');assert.equal(s.call(request).data.created,1);assert.equal(s.call(request).data.created,0);assert.equal(s.call({...request,...device,readerName:'나'}).data.created,0);
 assert.equal(s.call({action:'listSoundChecks'}).error.code,'ADMIN_REQUIRED');assert.equal(JSON.stringify(s.call({action:'listRecordings'})).includes('observer'),false);assert.equal(JSON.stringify(s.call({action:'getText'})).includes('soundChecks'),false);
 let checks=s.admin({action:'listSoundChecks'}).data.checks;assert.equal(checks.length,1);assert.equal(checks[0].deviceToken,undefined);assert.equal(s.call({action:'resolveSoundCheck',revision:text.revision,id:checks[0].id}).error.code,'ADMIN_REQUIRED');assert.equal(s.admin({action:'resolveSoundCheck',revision:text.revision,id:checks[0].id}).ok,true);assert.equal(s.admin({action:'listSoundChecks'}).data.checks.length,0);
 assert.equal(s.call({...request,reason:'silent'}).data.created,1);upload(1);assert.equal(s.admin({action:'listSoundChecks'}).data.checks.length,0);assert.equal(s.call(request).error.code,'CONFLICT');
 assert.equal(s.call({...request,targets:[{verse:2,playbackUrl:b.playbackUrl},{verse:1,playbackUrl:a.playbackUrl}]}).error.code,'CONFLICT');assert.equal(s.admin({action:'listSoundChecks'}).data.checks.length,0);
});
