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
    if (!raw || raw.length > 12000000) fail_('INVALID_REQUEST', '요청 크기 초과 또는 빈 요청');
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
    if(request.action==='getAccess')return {admin:adminAllowed_(request,properties),configured:!!properties.getProperty('ADMIN_KEY'),ownerRegistered:!!properties.getProperty('OWNER_DEVICE_ID'),joinRequired:state.rosterEnabled===true};
    if(request.action==='claimOwner'){
      var device=registeredDevice_(request,false),owner=properties.getProperty('OWNER_DEVICE_ID');
      if(owner&&!ownerAllowed_(request,properties))fail_('FORBIDDEN','처음 등록한 관리자 폰에서 열기');
      if(!owner){properties.setProperty('OWNER_DEVICE_ID',device.id);properties.setProperty('OWNER_DEVICE_HASH',device.hash);}return {admin:true};
    }
    if(request.action==='join')return join_(request,state,properties,folder,stateFile);
    if(request.action==='getRoster'){requireAdmin_(request,properties);return {members:(state.roster||[]).map(function(row){return {id:row.id,name:row.name};})};}
    if(request.action==='saveRoster'){requireAdmin_(request,properties);saveRoster_(request,state,properties);persist_(folder,properties,stateFile,state);return {members:state.roster.map(function(row){return {id:row.id,name:row.name};})};}
    if(request.action==='prepareTest'){requireAdmin_(request,properties);return prepareTest_(state,folder,properties);}
    if(request.dataset!==undefined&&request.dataset!=='main'&&request.dataset!=='test')fail_('INVALID_REQUEST','공간 확인');
    if(request.dataset==='test'){
      requireAdmin_(request,properties);var baseProperties=properties;
      properties={getProperty:function(key){return baseProperties.getProperty(key==='STATE_FILE_ID'?'TEST_STATE_FILE_ID':key);},setProperty:function(key,value){return baseProperties.setProperty(key==='STATE_FILE_ID'?'TEST_STATE_FILE_ID':key,value);}};
      fileId=properties.getProperty('STATE_FILE_ID');if(!fileId)fail_('NOT_FOUND','테스트 준비 필요');stateFile=DriveApp.getFileById(fileId);state=JSON.parse(stateFile.getBlob().getDataAsString('UTF-8'));
      if(request.action==='clearTest'){if(request.revision!==state.revision)fail_('CONFLICT','테스트 본문 다시 확인');var previous=state.recordings;state.recordings={};state.locks={};state.revision=Utilities.getUuid();persist_(folder,properties,stateFile,state);Object.keys(previous).forEach(function(v){trash_(previous[v].fileId);});return {text:text_(state),recordings:[]};}
    }else if(state.rosterEnabled&&!adminAllowed_(request,properties)){
      var member=member_(request,state);if(request.readerName!==undefined&&request.readerName!==member.name)fail_('FORBIDDEN','등록한 이름으로 참여');
      if(request.action==='saveAssignments')requireAdmin_(request,properties);
    }

    if(['getChapterFlow','setChapterFlow','toggleReaction','savePrayer','passPrayer'].indexOf(request.action)>=0)return chapterFlowAction_(request,state,properties,folder,stateFile);
    if (request.action === 'getText') return text_(state);
    if (request.action === 'listRecordings') {
      return { revision: state.revision, recordings: Object.keys(state.recordings)
        .sort(function (a, b) { return Number(a) - Number(b); })
        .map(function (verse) { return flowRecording_(state,state.recordings[verse],request); }) };
    }
    if(request.action==='listSoundChecks'){requireAdmin_(request,properties);return {revision:state.revision,checks:(state.soundChecks||[]).filter(function(check){return !check.resolvedAt&&state.recordings[check.verse]&&state.recordings[check.verse].playbackUrl===check.playbackUrl;})};}
    if (request.action === 'getAssignments') return state.flow&&state.flow.enabled?{revision:state.revision,assignmentRevision:state.assignmentRevision||'0',assignments:{}}:f5Plan_(state);
    if (request.action === 'listLocks') {var result=f2List_(state,properties);if(state.flow&&state.flow.enabled)result.locks.forEach(function(item){item.readerName='익명';});return result;}
    if (['saveText', 'uploadRecording', 'getAudio', 'acquireLock', 'renewLock', 'releaseLock','saveAssignments','saveGroups','deleteRecordings','createSoundCheck','resolveSoundCheck'].indexOf(request.action) < 0) {
      fail_('INVALID_REQUEST', '지원하지 않는 action');
    }
    if(['saveText','saveGroups','resolveSoundCheck'].indexOf(request.action)>=0)requireAdmin_(request,properties);
    if (request.revision !== state.revision) fail_('CONFLICT', '본문을 다시 조회한 뒤 재시도');
    if(request.action==='createSoundCheck'){
      var device=registeredDevice_(request,false),reader=string_(request.readerName,80,'읽은 사람 이름');
      if(['cut','silent'].indexOf(request.reason)<0||!Array.isArray(request.targets)||!request.targets.length||request.targets.length>500)fail_('INVALID_REQUEST','점검 사유·대상 확인');
      var checks=(state.soundChecks||[]).filter(function(check){return !check.resolvedAt&&state.recordings[check.verse]&&state.recordings[check.verse].playbackUrl===check.playbackUrl;}),created=[],seen={};
      request.targets.forEach(function(target){
        if(!target||!Number.isInteger(target.verse)||seen[target.verse]||typeof target.playbackUrl!=='string')fail_('INVALID_REQUEST','점검 대상 확인');seen[target.verse]=true;
        var item=state.recordings[target.verse];if(!item||item.playbackUrl!==target.playbackUrl)fail_('CONFLICT','녹음이 바뀜 · 목록 새로고침');
        if(ownsRecording_(item,device,reader)||(!item.deviceId&&item.readerName===reader))return;
        if(checks.some(function(check){return check.playbackUrl===item.playbackUrl&&check.deviceId===device.id&&check.reason===request.reason;}))return;
        var check={id:Utilities.getUuid(),verse:item.verse,endVerse:item.endVerse||item.verse,playbackUrl:item.playbackUrl,recordingReader:item.readerName,observer:reader,reason:request.reason,deviceId:device.id,createdAt:new Date().toISOString()};checks.push(check);created.push(check.id);
      });
      if(checks.length>500)fail_('BUSY','소리 점검 목록 확인 후 다시 시도');state.soundChecks=checks;persist_(folder,properties,stateFile,state);return {created:created.length};
    }
    if(request.action==='resolveSoundCheck'){
      var check=(state.soundChecks||[]).filter(function(check){return check.id===request.id;})[0];if(!check)fail_('NOT_FOUND','점검 항목 없음');check.resolvedAt=new Date().toISOString();persist_(folder,properties,stateFile,state);return {resolved:true};
    }
    if(request.action==='deleteRecordings'){
      var device=registeredDevice_(request,false),reader=string_(request.readerName,80,'읽은 사람 이름'),targets=request.targets;
      if(!Array.isArray(targets)||!targets.length||targets.length>500)fail_('INVALID_REQUEST','삭제할 녹음 필요');
      var seen={},removed=[],skipped=[];
      targets.forEach(function(target){
        if(!target||!Number.isInteger(target.verse)||target.verse<1||target.verse>verseCount_(state)||seen[target.verse]||typeof target.playbackUrl!=='string'||target.playbackUrl.length>2000)fail_('INVALID_REQUEST','삭제 대상 형식 오류');
        seen[target.verse]=true;var item=state.recordings[target.verse];
        if(!ownsRecording_(item,device,reader)){skipped.push(target.verse);return;}
        if(item.playbackUrl!==target.playbackUrl)fail_('CONFLICT','녹음이 바뀜 · 목록 다시 확인');
        var lease=(state.locks||{})[target.verse];if(lease&&lease.expiresAt>Date.now())fail_('LOCKED','녹음 중인 절은 잠금 해제 후 삭제');removed.push(item);
      });
      removed.forEach(function(item){delete state.recordings[item.verse];});
      if(removed.length){persist_(folder,properties,stateFile,state);removed.forEach(function(item){trash_(item.fileId);});}
      return {revision:state.revision,deleted:removed.map(function(item){return item.verse;}),skipped:skipped,recordings:Object.keys(state.recordings).map(function(v){return flowRecording_(state,state.recordings[v],request);})};
    }
    // F5: plans use an independent revision to reject stale simultaneous edits.
    if (request.action === 'saveAssignments') {
      if (request.assignmentRevision !== (state.assignmentRevision || '0')) fail_('CONFLICT', '배정표 다시 조회 필요');
      var plan=request.assignments;
      if (!plan || typeof plan !== 'object' || Array.isArray(plan) || Object.keys(plan).length > verseCount_(state)) fail_('INVALID_REQUEST', '배정표 형식 오류');
      var clean={};
      Object.keys(plan).forEach(function (verse) {
        if (!/^[1-9][0-9]*$/.test(verse) || Number(verse)>verseCount_(state)) fail_('INVALID_REQUEST', '배정 절 번호 오류');
        clean[verse]=string_(plan[verse],80,'배정 이름');
      });
      (state.groups || []).forEach(function (group) {for(var verse=group.start;verse<=group.end;verse++)if(clean[verse]!==clean[group.start])fail_('INVALID_REQUEST','묶음 배정 이름은 같아야 함');});
      state.assignments=clean;state.assignmentRevision=Utilities.getUuid();
      persist_(folder,properties,stateFile,state);return f5Plan_(state);
    }
    if (request.action === 'saveText') {
      var title = string_(request.title, 200, '제목');
      if (!Array.isArray(request.verses) || !request.verses.length || request.verses.length > 31102) {
        fail_('INVALID_REQUEST', '절은 1~31,102개 필요');
      }
      var verses = request.verses.map(function (v) { return string_(v, 10000, '절'); });
      if (JSON.stringify({ title: title, verses: verses }).length > 8000000) {
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
      var groups=f9Groups_(request.groups === undefined ? [] : request.groups,verses,pageStarts);
      var previous = state.recordings;
      var policy=state.flow?{enabled:state.flow.enabled,reactionLimit:state.flow.reactionLimit,reactions:{},chapters:{}}:null;var oldText=state.textFileId,roster=state.roster,sessions=state.sessions,rosterEnabled=state.rosterEnabled;
      var textFile=folder.createFile('reading-text-'+Utilities.getUuid()+'.json',JSON.stringify(verses),MimeType.PLAIN_TEXT);
      state = {flow:policy,roster:roster||[],sessions:sessions||{},rosterEnabled:!!rosterEnabled,textFileId:textFile.getId(),verseCount:verses.length, groups:groups, title: title, verses: [], pageStarts: pageStarts, chapters: chapters, books: books, revision: Utilities.getUuid(), recordings: {} };
      persist_(folder, properties, stateFile, state);
      Object.keys(previous).forEach(function (v) { trash_(previous[v].fileId); });if(oldText)trash_(oldText);
      return text_(state);
    }
    // F9: regrouping changes recording units and invalidates pending old-revision writes.
    if(request.action === 'saveGroups') {
      var next=f9Groups_(request.groups,{length:verseCount_(state)},state.pageStarts || [0]);
      if(JSON.stringify(next)===JSON.stringify(state.groups || []))return f9Result_(state,request);
      var affected=Object.keys(state.recordings).filter(function(key){return f9Changed_(state.recordings[key],next);});
      if(affected.length && request.discardRecordings!==true)fail_('RECORDINGS_EXIST','변경될 녹음 삭제 동의 필요');
      var removed=affected.map(function(key){var item=state.recordings[key];delete state.recordings[key];return item;});
      state.groups=next;state.revision=Utilities.getUuid();state.locks={};
      state.assignments=state.assignments || {};
      next.forEach(function(group){var owner=state.assignments[group.start];for(var verse=group.start;verse<=group.end;verse++){if(owner)state.assignments[verse]=owner;else delete state.assignments[verse];}});
      state.assignmentRevision=Utilities.getUuid();persist_(folder,properties,stateFile,state);
      removed.forEach(function(item){trash_(item.fileId);});return f9Result_(state,request);
    }
    var verse = request.verse;
    if (!Number.isInteger(verse) || verse < 1 || verse > verseCount_(state)) {
      fail_('INVALID_REQUEST', '현재 본문의 절 번호 필요');
    }
    var unit=f9Range_(state.groups || [],verse);
    if(request.action!=='getAudio' && verse!==unit.start)fail_('INVALID_REQUEST','묶음 첫 절 번호 필요');
    if(request.action==='uploadRecording' && (request.endVerse===undefined?verse:request.endVerse)!==unit.end)fail_('INVALID_REQUEST','묶음 범위 변경됨. 본문 새로고침 필요');
    var old = state.recordings[verse];
    if(state.flow&&state.flow.enabled&&['uploadRecording','acquireLock'].indexOf(request.action)>=0&&!flowOpened_(state,flowChapter_(state,verse)))fail_('CHAPTER_LOCKED','이전 장 대표기도 완료 후 열림');
    // F2: server policy is deployment-wide, never trusted from a caller's toggle.
    if (['acquireLock','renewLock','releaseLock'].indexOf(request.action) >= 0) return f2Lease_(request, state, properties, folder, stateFile);
    if(request.action==='uploadRecording' && request.uploadId!==undefined){
      if(typeof request.uploadId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(request.uploadId))fail_('INVALID_REQUEST','uploadId 형식 오류');
      if(old && old.uploadId===request.uploadId)return recording_(old);
    }
    if(request.action==='uploadRecording' && request.expectedPrevious!==undefined && request.expectedPrevious!==(old?old.playbackUrl:null))fail_('CONFLICT','다른 녹음으로 변경됨');
    if (request.action === 'uploadRecording' && f2Enabled_(properties)) f2AuthorizeUpload_(request, state);
    if (request.action === 'getAudio') {
      if (!old) fail_('NOT_FOUND', '아직 녹음하지 않은 절');
      if(state.flow&&state.flow.enabled&&!flowComplete_(state,flowChapter_(state,verse))&&!flowOwn_(old,request))fail_('CHAPTER_INCOMPLETE','장 녹음 완성 전에는 내 녹음만 재생 가능');
      return { mimeType: old.mimeType,
        audioBase64: Utilities.base64Encode(DriveApp.getFileById(old.fileId).getBlob().getBytes()) };
    }
    var readerName = string_(request.readerName, 80, '읽은 사람 이름');
    var device=registeredDevice_(request,true);
    if(old&&old.deviceId&&!ownsRecording_(old,device,readerName))fail_('FORBIDDEN','등록한 기기와 이름만 다시 녹음 가능');
    var mime = typeof request.mimeType === 'string' ? request.mimeType.split(';')[0].trim().toLowerCase() : '';
    if (['audio/webm', 'audio/ogg', 'audio/wav'].indexOf(mime) < 0) fail_('INVALID_REQUEST', 'webm/ogg/wav만 지원');
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
    if (mime === 'audio/wav' ? !wavValid_(bytes) : signature !== (mime === 'audio/webm' ? '26,69,223,163' : '79,103,103,83')) {
      fail_('INVALID_REQUEST', '음성 컨테이너 형식 불일치');
    }
    var file = folder.createFile(Utilities.newBlob(bytes, mime,
      'verse-' + verse + '-' + Utilities.getUuid() + (mime === 'audio/webm' ? '.webm' : mime === 'audio/wav' ? '.wav' : '.ogg')));
    try {
      // Dedicated folder must be private; never enable public link sharing here.
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      state.recordings[verse] = { verse: verse, endVerse:unit.end, readerName: readerName,
        memberId:state.rosterEnabled&&!adminAllowed_(request,properties)?member_(request,state).memberId:null,deviceId:device?device.id:null,deviceHash:device?device.hash:null,uploadId:request.uploadId || null, fileId: file.getId(), playbackUrl: file.getUrl(), mimeType: mime,
        recordedAt: new Date().toISOString() };
      if (f2Enabled_(properties) && state.locks) delete state.locks[verse];
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
  if(state.flow&&state.flow.enabled)flowSync_(state);
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
  return { chapterFlowEnabled:!!(state.flow&&state.flow.enabled), groups:state.groups || [], books: state.books || [{title:state.title.slice(0, 80) || '본문', startChapter:0}], title: state.title, verses: verses_(state), pageStarts: state.pageStarts || [0], chapters: state.chapters || (state.pageStarts || [0]).map(function (start, index) { return {title: (index + 1) + '장', startVerse: start + 1}; }), revision: state.revision };
}

function recording_(value) {
  return { deviceId:value.deviceId || null, verse: value.verse, endVerse:value.endVerse || value.verse, readerName: value.readerName,
    uploadId:value.uploadId || null, playbackUrl: value.playbackUrl, recordedAt: value.recordedAt };
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

// F2: opt-in deployment policy; 120-second leases, renewed by the recording phone.
function f2Enabled_(properties) { return properties.getProperty('F2_ENABLED') === 'true'; }
function f2List_(state, properties) {
  return {enabled:f2Enabled_(properties), revision:state.revision,
    locks: f2Enabled_(properties) ? Object.keys(state.locks || {}).filter(function (verse) {
      return state.locks[verse].expiresAt > Date.now();
    }).map(function (verse) {
      var lease=state.locks[verse];
      return {verse:Number(verse),endVerse:lease.endVerse || Number(verse),readerName:lease.readerName,expiresAt:lease.expiresAt};
    }) : []};
}
function f2Lease_(request, state, properties, folder, file) {
  if (!f2Enabled_(properties)) fail_('FEATURE_DISABLED', '배포 설정에 F2_ENABLED=true 필요');
  state.locks=state.locks || {};
  var current=state.locks[request.verse], now=Date.now();
  if (request.action === 'releaseLock') {
    if (current && current.token === request.leaseToken) {
      delete state.locks[request.verse]; persist_(folder, properties, file, state);
    }
    return {released:true};
  }
  var reader=string_(request.readerName,80,'읽은 사람 이름');
  if (request.action === 'acquireLock') {
    var recording=state.recordings[request.verse];
    if(recording&&recording.deviceId&&!ownsRecording_(recording,registeredDevice_(request,true),reader))fail_('FORBIDDEN','등록한 기기와 이름만 다시 녹음 가능');
    if (recording && recording.readerName !== reader) fail_('FORBIDDEN', '녹음한 이름만 다시 녹음 가능');
    if (current && current.expiresAt > now) fail_('LOCKED', '다른 폰에서 읽는 중');
    current={endVerse:f9Range_(state.groups || [],request.verse).end,readerName:reader,token:Utilities.getUuid(),expiresAt:now+120000};
  } else {
    if (!current || current.token !== request.leaseToken || current.readerName !== reader || current.expiresAt <= now) fail_('LOCK_EXPIRED', '녹음 잠금 만료. 다시 녹음 필요');
    current.expiresAt=now+120000;
  }
  // Prune expired leases to bound the state file even after interrupted sessions.
  Object.keys(state.locks).forEach(function (verse) {if(state.locks[verse].expiresAt<=now) delete state.locks[verse];});
  state.locks[request.verse]=current; persist_(folder,properties,file,state);
  return {verse:request.verse,endVerse:current.endVerse || request.verse,leaseToken:current.token,expiresAt:current.expiresAt};
}
function f2AuthorizeUpload_(request, state) {
  var old=state.recordings[request.verse];
  if (old && old.readerName !== request.readerName) fail_('FORBIDDEN', '녹음한 이름만 다시 녹음 가능');
  var lease=(state.locks || {})[request.verse];
  if (!lease || lease.expiresAt <= Date.now() || lease.token !== request.leaseToken || lease.readerName !== request.readerName) fail_('LOCK_EXPIRED', '녹음 잠금 만료. 다시 녹음 필요');
}

// F5: absent plan is compatible with existing deployments/data.
function f5Plan_(state) {return {revision:state.revision,assignmentRevision:state.assignmentRevision || '0',assignments:state.assignments || {}};}

// F9 ranges use absolute 1-based verse indices, never cross chapter boundaries.
function f9Groups_(groups,verses,starts) {
  if(!Array.isArray(groups)||groups.length>verses.length)fail_('INVALID_REQUEST','묶음 형식 오류');
  var previous=0;
  return groups.map(function(group){
    if(!group || !Number.isInteger(group.start)||!Number.isInteger(group.end)||group.start<=previous||group.start<1||group.end<=group.start||group.end>verses.length)fail_('INVALID_REQUEST','묶음 범위·겹침 오류');
    var chapter=0;for(var i=0;i<starts.length;i++)if(starts[i]<group.start)chapter=i;
    if(group.end>(starts[chapter+1]===undefined?verses.length:starts[chapter+1]))fail_('INVALID_REQUEST','묶음은 같은 장만 가능');
    previous=group.end;return {start:group.start,end:group.end};
  });
}
function f9Range_(groups,verse) {for(var i=0;i<groups.length;i++)if(groups[i].start<=verse&&groups[i].end>=verse)return groups[i];return {start:verse,end:verse};}
function f9Changed_(recording,groups) {var unit=f9Range_(groups,recording.verse);return unit.start!==recording.verse||unit.end!==(recording.endVerse || recording.verse);}
function f9Result_(state,request) {return {text:text_(state),recordings:Object.keys(state.recordings).sort(function(a,b){return Number(a)-Number(b);}).map(function(key){return flowRecording_(state,state.recordings[key],request);})};}

// F10 produces canonical 24kHz mono PCM16 WAV. Reject misleading RIFF headers.
function wavValid_(bytes) {
  function str(at,n){return bytes.slice(at,at+n).map(function(b){return String.fromCharCode(b&255);}).join('');}
  function uint(at,n){var value=0;for(var i=0;i<n;i++)value+=(bytes[at+i]&255)*Math.pow(256,i);return value;}
  return bytes.length>44 && bytes.length%2===0 && str(0,4)==='RIFF' && str(8,4)==='WAVE' && str(12,4)==='fmt ' && str(36,4)==='data' && uint(4,4)===bytes.length-8 && uint(16,4)===16 && uint(20,2)===1 && uint(22,2)===1 && uint(24,4)===24000 && uint(28,4)===48000 && uint(32,2)===2 && uint(34,2)===16 && uint(40,4)===bytes.length-44;
}

// Device tokens never leave private state as plaintext and are never returned in listings.
function registeredDevice_(request,optional){
  if(optional&&request.deviceId===undefined&&request.deviceToken===undefined)return null;
  if(typeof request.deviceId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(request.deviceId)||typeof request.deviceToken!=='string'||!/^[a-f0-9]{64}$/.test(request.deviceToken))fail_('INVALID_REQUEST','등록 기기 정보 필요');
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,request.deviceToken,Utilities.Charset.UTF_8);
  return {id:request.deviceId,hash:bytes.map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('')};
}
function ownsRecording_(item,device,reader){return !!item&&!!device&&!!item.deviceId&&item.deviceId===device.id&&item.deviceHash===device.hash&&item.readerName===reader;}

function ownerAllowed_(request,properties){if(!properties.getProperty('OWNER_DEVICE_ID'))return false;try{var device=registeredDevice_(request,false);return device.id===properties.getProperty('OWNER_DEVICE_ID')&&device.hash===properties.getProperty('OWNER_DEVICE_HASH');}catch(_){return false;}}
function adminAllowed_(request,properties){var key=properties.getProperty('ADMIN_KEY');return (!!key&&typeof request.adminKey==='string'&&request.adminKey===key)||ownerAllowed_(request,properties);}
function requireAdmin_(request,properties){if(adminAllowed_(request,properties))return;if(!properties.getProperty('ADMIN_KEY')&&!properties.getProperty('OWNER_DEVICE_ID'))fail_('NOT_CONFIGURED','관리자 폰 등록 필요');fail_('ADMIN_REQUIRED','등록된 관리자 폰 필요');}
function verseCount_(state){return state.textFileId?state.verseCount:state.verses.length;}
function verses_(state){return state.textFileId?JSON.parse(DriveApp.getFileById(state.textFileId).getBlob().getDataAsString('UTF-8')):state.verses;}
function digest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function contactHash_(properties,name,last4){if(typeof last4!=='string'||!/^\d{4}$/.test(last4))fail_('INVALID_REQUEST','연락처 뒷자리 4자리 필요');var salt=properties.getProperty('ROSTER_SALT');if(!salt){salt=Utilities.getUuid()+Utilities.getUuid();properties.setProperty('ROSTER_SALT',salt);}return digest_(salt+':'+name+':'+last4);}
function saveRoster_(request,state,properties){if(!Array.isArray(request.members)||request.members.length>1000)fail_('INVALID_REQUEST','명단은 최대 1,000명');var old=state.roster||[],seen={};var rows=request.members.map(function(row){if(!row)fail_('INVALID_REQUEST','명단 확인');var name=string_(row.name,80,'이름'),previous=old.filter(function(x){return x.id===row.id;})[0],hash=row.last4===undefined&&previous?previous.contactHash:contactHash_(properties,name,row.last4);if(previous&&row.last4===undefined&&previous.name!==name)fail_('INVALID_REQUEST','이름 변경 시 뒷자리 다시 입력');var signature=name+':'+hash;if(seen[signature])fail_('INVALID_REQUEST','중복 명단');seen[signature]=true;return {id:previous?previous.id:Utilities.getUuid(),name:name,contactHash:hash};});var sessions=state.sessions||{};Object.keys(sessions).forEach(function(id){var session=sessions[id],current=rows.filter(function(r){return r.id===session.memberId;})[0],previous=old.filter(function(r){return r.id===session.memberId;})[0];if(!current||!previous||current.contactHash!==previous.contactHash||current.name!==previous.name)delete sessions[id];});state.sessions=sessions;state.roster=rows;state.rosterEnabled=true;}
function join_(request,state,properties,folder,stateFile){var device=registeredDevice_(request,false),name=string_(request.readerName,80,'이름'),hash=contactHash_(properties,name,request.last4),now=Date.now(),attempts=state.joinAttempts||{};Object.keys(attempts).forEach(function(id){if(attempts[id].until<now)delete attempts[id];});var attempt=attempts[device.id]||{count:0,until:now+900000};if(attempt.count>=5)fail_('BUSY','15분 뒤 다시 확인');attempt.count++;attempts[device.id]=attempt;var ids=Object.keys(attempts);if(ids.length>1000)fail_('BUSY','잠시 후 다시 확인');state.joinAttempts=attempts;var row=(state.roster||[]).filter(function(r){return r.name===name&&r.contactHash===hash;})[0];if(!state.rosterEnabled||!row){persist_(folder,properties,stateFile,state);fail_('MEMBER_REQUIRED','이름·뒷자리 또는 등록 명단 확인');}var token=Utilities.getUuid()+Utilities.getUuid();state.sessions=state.sessions||{};state.sessions[device.id]={memberId:row.id,name:row.name,deviceHash:device.hash,tokenHash:digest_(token)};delete attempts[device.id];persist_(folder,properties,stateFile,state);return {name:row.name,memberId:row.id,sessionToken:token};}
function member_(request,state){var device=registeredDevice_(request,true),session=device&&(state.sessions||{})[device.id];if(!session||session.deviceHash!==device.hash||typeof request.sessionToken!=='string'||digest_(request.sessionToken)!==session.tokenHash||!(state.roster||[]).some(function(row){return row.id===session.memberId;}))fail_('MEMBER_REQUIRED','이름·연락처 뒷자리 확인 필요');return session;}
function prepareTest_(state,folder,properties){var existing=properties.getProperty('TEST_STATE_FILE_ID');if(existing){var saved=JSON.parse(DriveApp.getFileById(existing).getBlob().getDataAsString('UTF-8'));return text_(saved);}var books=state.books||[],book=books.filter(function(b){return b.title==='잠언';})[0];if(!book)fail_('NOT_FOUND','잠언 본문 준비 필요');var ch=book.startChapter,first=(state.pageStarts||[0])[ch],chapter=(state.chapters||[])[ch];if(chapter&&(chapter.startVerse!==1||chapter.title!=='1장'))fail_('INVALID_REQUEST','잠언 1장 1절부터 필요');var copy=verses_(state).slice(first,Math.min(first+10,state.pageStarts[ch+1]||verseCount_(state)));if(copy.length<10)fail_('NOT_FOUND','잠언 1장 1~10절 준비 필요');var test={title:'테스트',verses:copy,revision:Utilities.getUuid(),recordings:{},pageStarts:[0],chapters:[{title:'1장',startVerse:1}],books:[{title:'테스트',startChapter:0}],groups:[]};var file=folder.createFile('reading-test.json',JSON.stringify(test),MimeType.PLAIN_TEXT);properties.setProperty('TEST_STATE_FILE_ID',file.getId());return text_(test);}

// Chapter covenant: opt-in on the registered administrator phone; all privacy is enforced here.
function flowChapter_(state,verse){var starts=state.pageStarts||[0],i=0;while(i+1<starts.length&&starts[i+1]<verse)i++;return i;}
function flowComplete_(state,ch){var starts=state.pageStarts||[0],from=starts[ch],to=starts[ch+1]===undefined?verseCount_(state):starts[ch+1];if(from===undefined||to<=from)return false;for(var v=from+1;v<=to;v++){var unit=f9Range_(state.groups||[],v);if(!state.recordings[unit.start])return false;}return true;}
function flowOwn_(item,request){if(!item)return false;var device=registeredDevice_(request,true);return !!device&&item.deviceId===device.id&&item.deviceHash===device.hash;}
function flowOpened_(state,ch){if(!state.flow||!state.flow.enabled||ch===0)return true;return !!(state.flow.chapters&&state.flow.chapters[ch-1]&&state.flow.chapters[ch-1].prayer);}
function flowIdentity_(state,request){var device=registeredDevice_(request,false);return state.rosterEnabled&&!ownerAllowed_(request,PropertiesService.getScriptProperties())?'member:'+member_(request,state).memberId:'device:'+device.id+':'+device.hash;}
function flowHearts_(state,ch){var result={},starts=state.pageStarts||[0],from=starts[ch],to=starts[ch+1]===undefined?verseCount_(state):starts[ch+1];Object.keys(state.flow.reactions||{}).forEach(function(key){(state.flow.reactions[key]||[]).forEach(function(v){if(v>from&&v<=to)result[v]=(result[v]||0)+1;});});return result;}
function flowCandidates_(state,ch){var hearts=flowHearts_(state,ch),seen={},result=[];Object.keys(hearts).sort(function(a,b){return hearts[b]-hearts[a]||Number(a)-Number(b);}).forEach(function(v){var item=state.recordings[f9Range_(state.groups||[],Number(v)).start],key=item&&(item.memberId?'member:'+item.memberId:'device:'+item.deviceId);if(item&&item.deviceId&&!seen[key]){seen[key]=true;result.push({id:item.deviceId,hash:item.deviceHash,memberId:item.memberId||null,name:item.readerName,verse:Number(v)});}});return result;}
function flowCandidateOwn_(candidate,state,request){if(!candidate)return false;if(candidate.memberId&&state.rosterEnabled){try{return member_(request,state).memberId===candidate.memberId;}catch(_){return false;}}var device=registeredDevice_(request,false);return candidate.id===device.id&&candidate.hash===device.hash;}
function flowSync_(state){var flow=state.flow;flow.chapters=flow.chapters||{};flow.reactions=flow.reactions||{};(state.pageStarts||[0]).forEach(function(_,ch){if(!flowComplete_(state,ch)){delete flow.chapters[ch];return;}if(!flow.chapters[ch]){var candidates=flowCandidates_(state,ch);flow.chapters[ch]={completedAt:Date.now(),assignee:candidates[0]||null};}});}
function flowStage_(state,ch){var entry=state.flow.chapters[ch];if(!entry)return 'recording';if(entry.prayer)return 'done';if(!entry.assignee)return 'all';var elapsed=Date.now()-entry.completedAt;if(entry.passed||elapsed>=21600000)return Date.now()>=(entry.recipientsAt||entry.completedAt+21600000)+21600000?'all':'recipients';return 'assignee';}
function flowCanPray_(state,ch,request){var entry=state.flow.chapters[ch];if(!entry||entry.prayer)return false;var device=registeredDevice_(request,false),stage=flowStage_(state,ch);if(stage==='all'){if(state.rosterEnabled&&!ownerAllowed_(request,PropertiesService.getScriptProperties()))member_(request,state);return true;}if(stage==='assignee')return flowCandidateOwn_(entry.assignee,state,request);return flowCandidates_(state,ch).some(function(row){return (row.memberId?'member:'+row.memberId:'device:'+row.id)!==(entry.assignee.memberId?'member:'+entry.assignee.memberId:'device:'+entry.assignee.id)&&flowCandidateOwn_(row,state,request);});}
function flowStatus_(state,request){var flow=state.flow;if(!flow||!flow.enabled)return {revision:state.revision,enabled:false,reactionLimit:3,mine:[],chapters:[]};flowSync_(state);var identity=null;try{identity=flowIdentity_(state,request);}catch(_){}return {revision:state.revision,enabled:true,reactionLimit:flow.reactionLimit||3,mine:identity?(flow.reactions[identity]||[]):[],chapters:(state.pageStarts||[0]).map(function(_,ch){var entry=flow.chapters[ch],complete=flowComplete_(state,ch),stage=flowStage_(state,ch),can=false;try{can=flowCanPray_(state,ch,request);}catch(_){}return {chapter:ch,opened:flowOpened_(state,ch),complete:complete,hearts:complete?flowHearts_(state,ch):{},stage:stage,canPray:can,canPass:stage==='assignee'&&can,assignee:complete&&entry.assignee?entry.assignee.name:null,deadline:entry&&!entry.prayer&&entry.assignee?(stage==='assignee'?entry.completedAt+21600000:stage==='recipients'?(entry.recipientsAt||entry.completedAt+21600000)+21600000:null):null,prayer:entry&&entry.prayer?{text:entry.prayer.text,readerName:entry.prayer.readerName,createdAt:entry.prayer.createdAt}:null};})};}
function flowRecording_(state,item,request){var value=recording_(item);if(state.flow&&state.flow.enabled&&!flowComplete_(state,flowChapter_(state,item.verse))&&!flowOwn_(item,request))return {verse:item.verse,endVerse:item.endVerse||item.verse,readerName:'익명',deviceId:null,playbackUrl:null,recordedAt:null,uploadId:null,anonymous:true};return value;}
function chapterFlowAction_(request,state,properties,folder,file){
  if(request.action==='getChapterFlow')return flowStatus_(state,request);
  if(request.revision!==state.revision)fail_('CONFLICT','본문 다시 확인');
  if(request.action==='setChapterFlow'){requireAdmin_(request,properties);if(request.enabled===true&&folder.getSharingAccess()!==DriveApp.Access.PRIVATE)fail_('FOLDER_PUBLIC','녹음 폴더 공유를 제한됨으로 바꾼 뒤 켜기');if(typeof request.enabled!=='boolean'||(request.reactionLimit!==undefined&&(!Number.isInteger(request.reactionLimit)||request.reactionLimit<1||request.reactionLimit>10)))fail_('INVALID_REQUEST','리액션 한도는 1~10');state.flow=state.flow||{reactions:{},chapters:{}};state.flow.enabled=request.enabled;state.flow.reactionLimit=request.reactionLimit||state.flow.reactionLimit||3;persist_(folder,properties,file,state);return flowStatus_(state,request);}
  if(!state.flow||!state.flow.enabled)fail_('NOT_CONFIGURED','관리자에서 완성·기도 규칙 켜기');flowSync_(state);
  var identity=flowIdentity_(state,request),device=registeredDevice_(request,false),ch=request.chapter;
  if(request.action==='toggleReaction'){
    if(!Number.isInteger(request.verse)||request.verse<1||request.verse>verseCount_(state))fail_('INVALID_REQUEST','절 번호 확인');ch=flowChapter_(state,request.verse);if(!flowOpened_(state,ch))fail_('CHAPTER_LOCKED','이전 장 대표기도 완료 후 열림');if(flowComplete_(state,ch))fail_('REACTIONS_CLOSED','장 완성 후 리액션 마감');var mine=state.flow.reactions[identity]||[],index=mine.indexOf(request.verse);if(index>=0)mine.splice(index,1);else{if(mine.filter(function(v){return flowChapter_(state,v)===ch;}).length>=(state.flow.reactionLimit||3))fail_('REACTION_LIMIT','이 장의 하트는 최대 '+state.flow.reactionLimit+'개');mine.push(request.verse);}state.flow.reactions[identity]=mine;
  }else{
    if(!Number.isInteger(ch)||ch<0||ch>=(state.pageStarts||[0]).length)fail_('INVALID_REQUEST','장 번호 확인');if(!flowCanPray_(state,ch,request))fail_('FORBIDDEN','현재 대표기도 참여 대상이 아님');var entry=state.flow.chapters[ch];if(request.action==='passPrayer'){if(flowStage_(state,ch)!=='assignee')fail_('FORBIDDEN','대표기도자만 양도 가능');entry.passed=true;entry.recipientsAt=Date.now();}
    else if(request.action==='savePrayer'){var text=string_(request.text,500,'기도문'),name=string_(request.readerName,80,'이름');if(state.rosterEnabled&&!adminAllowed_(request,properties)&&name!==member_(request,state).name)fail_('FORBIDDEN','등록한 이름으로 참여');entry.prayer={text:text,readerName:name,deviceId:device.id,createdAt:new Date().toISOString()};}
  }
  persist_(folder,properties,file,state);return flowStatus_(state,request);
}
