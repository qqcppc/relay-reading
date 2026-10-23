# 화면 ↔ 저장 API

웹 앱 `/exec` 사용. 한 배포는 본문 하나를 관리한다. 절 번호는 1부터 시작한다.
모든 응답은 JSON: 성공 `{ "ok": true, "data": ... }`, 실패
`{ "ok": false, "error": { "code": "INVALID_REQUEST", "message": "..." } }`.
HTTP 상태 대신 `ok`를 반드시 확인한다. 시각은 UTC ISO 8601 문자열.

## 요청

GET: `/exec?action=getText&key=공유키` 또는 `action=listRecordings`.
POST: JSON 문자열을 **text/plain;charset=utf-8**로 전송한다. 인증 헤더나
application/json은 사용하지 않는다(브라우저 사전 요청 방지). 읽기도 POST 가능.
`key`는 배포자가 정한 소그룹 공유키이며 저장소에 커밋하지 않는다. GET URL에는
키가 남으므로 화면에서는 POST 권장. 공유키를 아는 사람은 모두 읽기·쓰기 가능.

```js
const result = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'getText', key: groupKey })
}).then(r => r.json());
if (!result.ok) throw new Error(result.error.message);
```

리디렉션은 기본 설정대로 따른다. `mode: 'no-cors'`는 응답을 읽지 못하므로 금지.

| action | 추가 요청 필드 | 성공 data |
| --- | --- | --- |
| getText | 없음 | `{title, verses: ["첫 줄", "둘째 줄"], pageStarts: [0], revision}` |
| saveText | `title`, `verses` 문자열 배열, `pageStarts`(선택), `revision` | 새 본문 객체 |
| listRecordings | 없음 | `{revision, recordings: [{verse, readerName, playbackUrl, recordedAt}]}` |
| uploadRecording | `revision`, `verse`, `readerName`, `mimeType`, `audioBase64` | 녹음 객체(위 목록의 항목과 동일) |
| getAudio | `revision`, `verse` | `{mimeType, audioBase64}` |

초기 본문은 `{title:"", verses:[], revision:"0"}`.
저장·업로드·음성 조회는 마지막으로 읽은 `revision`을 보낸다.
본문 저장은 **모든 절 녹음을 초기화**하고 이전 파일을 휴지통으로 옮긴다.
본문 버전이 다르면 `CONFLICT`: 본문과 목록을 다시 조회한다.
같은 절 업로드는 마지막으로 성공한 요청이 이기며 이전 파일은 휴지통으로 이동한다.
목록은 녹음된 절만 절 번호순으로 반환한다.

```json
{"action":"uploadRecording","key":"공유키","revision":"본문에서 받은 버전","verse":1,"readerName":"민수","mimeType":"audio/webm;codecs=opus","audioBase64":"BASE64_ONLY"}
```

`audioBase64`는 Data URL 접두사 없는 표준 Base64. webm/ogg만 허용하며
`audio/webm`, `audio/ogg`와 `;codecs=opus` 같은 매개변수를 받는다.
파일당 최대 5 MiB. 제목 200자, 이름 80자, 절 500개, 절당 10,000자,
본문 전체 JSON 500,000자 이하. 빈 제목·이름·절은 거부한다.

## 재생

`playbackUrl`은 Drive 파일 열기 주소다. 파일은 비공개이므로 배포자 계정의
Drive 플레이어에서 확인할 때 사용한다. 익명 `<audio src>` 직접 재생용 주소가 아니다.
**다른 폰의 화면 재생은 getAudio로 받아 Blob URL을 만든다.** Drive 공개 공유 불필요.

```js
// data는 getAudio 성공 응답의 data
const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
audio.src = url; // 절 전환/목록 갱신 때 이전 URL.revokeObjectURL 호출
```

재녹음 후에는 getAudio를 다시 호출한다. 오래된 Blob URL은 자동 갱신되지 않는다.
이어듣기는 listRecordings 순서대로 getAudio 후 재생한다.

## 오류

`UNAUTHORIZED` 공유키 오류 · `INVALID_REQUEST` 잘못된 JSON/필드/파일 ·
`CONFLICT` 본문 버전 변경 · `NOT_FOUND` 미녹음 절 · `BUSY` 잠시 후 재시도 ·
`NOT_CONFIGURED` 서버 설정 누락 · `INTERNAL_ERROR` Drive/서버 오류.
실패·시간 초과 시 자동으로 업로드 성공으로 처리하지 말고 목록을 재조회한다.

## 여러 페이지 (2026-10-23)

`verses`는 전체 페이지의 줄을 순서대로 이어 붙인 배열이다. 녹음 `verse`는 이 배열의 **1부터 시작하는 전체 줄 번호**를 유지한다. `pageStarts`는 각 페이지 첫 줄의 **0부터 시작하는 배열 위치**다. 예: 4줄씩 4페이지는 `[0,4,8,12]`.

`saveText`에 `pageStarts`를 보내면 저장하고 `getText`와 저장 응답에서 반환한다. 첫 값 0, 엄격한 오름차순 정수, 모든 값은 `verses.length` 미만이어야 한다. 생략한 구형 요청/기존 저장 데이터는 `[0]`(전체 한 페이지)로 처리한다. 빈 초기 본문도 `[0]`이다. 페이지 경계 변경도 본문 저장이므로 revision 변경·기존 녹음 초기화가 적용된다.

이번 페이지 기능을 공유 모드에서 사용하기 전에 최신 Code.gs로 웹 앱 새 버전 배포 필요. 구형 서버는 pageStarts를 보존하지 못한다.

### 장 제목과 화면 절 번호

본문 응답과 saveText 요청에 `chapters` 배열 추가. pageStarts와 같은 길이이며 각 항목은 `{title: "1장", startVerse: 1}`. 제목 1~80자, 시작 번호는 1~1,000,000 정수. 생략한 구형 요청/기존 데이터는 장 제목을 `1장`, `2장` 순서로, 시작 절은 해당 pageStarts+1로 처리한다.

예: `pageStarts:[0,4]`, `chapters:[{title:"첫 장",startVerse:1},{title:"둘째 장",startVerse:5}]`. 화면 절 번호는 표시용이며 녹음 API verse는 그대로 전체 배열 기준 1부터 시작하는 번호다. 장 제목·시작 절 변경도 본문 저장이므로 기존 녹음이 초기화된다. 최신 Code.gs 배포 필요.

### 책 구조

`saveText`에 선택 필드 `books: [{title:"첫 책",startChapter:0},{title:"둘째 책",startChapter:2}]`를 보내고 본문 응답에서도 반환한다. startChapter는 pageStarts/chapters 배열의 **0부터 시작하는 장 위치**다. 첫 책은 0, 이후 값은 엄격한 오름차순 정수이며 pageStarts.length 미만이어야 한다. 제목 1~80자, 책 수는 전체 장 수 이하. 66권 지원(기존 전체 줄 500개 제한 적용).

생략된 구형 요청·기존 저장 데이터는 `[{title:본문제목의_앞80자,startChapter:0}]` 한 책으로 처리하며 빈 본문의 책 제목은 `본문`. books 변경도 revision 변경과 녹음 초기화를 수반한다. 녹음 verse는 책/장에 상관없이 전체 verses 배열의 1부터 시작하는 위치를 유지한다. 최신 Code.gs 배포 필요.

## F2: 읽는 중 잠금·이름별 재녹음 (기본 OFF)

배포자 스크립트 속성 `F2_ENABLED=true`일 때만 서버가 그룹 전체에 적용한다. 폰의 F2 스위치도 켜야 잠금을 요청한다. 속성 없음/false이면 기존 API 그대로다. 활성 배포에서는 OFF/구형 클라이언트의 무잠금 업로드도 거부하므로 그룹원 모두 F2를 켜야 한다. 한 폰에서 OFF로 바꿔도 다른 폰의 잠금이나 서버 정책을 우회하지 않는다.

모든 요청은 기존 key 인증. 아래 변경 요청은 revision과 전체 줄 기준 verse를 보낸다.
- `listLocks` → `{enabled, revision, locks:[{verse,readerName,expiresAt}]}`. expiresAt은 UTC epoch 밀리초, 만료된 항목 제외. 토큰은 공개하지 않음.
- `acquireLock` + readerName → `{verse,leaseToken,expiresAt}`. 유효기간 120초. 이미 잠겼으면 `LOCKED`, 기존 녹음 이름이 다르면 `FORBIDDEN`.
- `renewLock` + readerName + leaseToken → 같은 응답. 30초마다 갱신 권장. 만료 후 갱신은 `LOCK_EXPIRED`.
- `releaseLock` + leaseToken → `{released:true}`. 자신이 받은 토큰과 일치하는 잠금만 해제. 이미 없으면 성공.
- `uploadRecording`에 leaseToken 추가. 활성 배포는 토큰·이름·유효기간을 검증하고 성공 후 잠금 해제. 무잠금/만료는 `LOCK_EXPIRED`, 다른 이름의 녹음 교체는 `FORBIDDEN`.

녹음·확인 대기 중 갱신, 취소/실패 시 해제. 폰 종료·네트워크 단절 시 최대 120초 뒤 자동 해제. 폰의 타인 잠금 표시는 10초마다 갱신(시작 시 서버 재검증). 본문 저장은 이전 revision의 잠금도 초기화한다. 배포 비활성 상태에서 잠금 요청은 `FEATURE_DISABLED`.

이름은 사용자가 입력하는 값으로, 계정 인증이 아니다. 같은 이름을 입력한 다른 사람을 구분하는 권한 모델은 아니다. 공유키를 아는 그룹의 이름별 사용 규칙이며, 진짜 사용자 인증이 필요하면 별도 로그인 설계가 필요하다.

## F5: 배정표 (본문·녹음과 별도 저장)

- POST `{"action":"getAssignments","key":"..."}` → `{revision, assignmentRevision, assignments:{"1":"민수","2":"지수"}}`.
- POST `{"action":"saveAssignments","key":"...","revision":"본문 버전","assignmentRevision":"배정 버전","assignments":{"1":"민수"}}` → 저장된 같은 형태.

키는 전체 verses 배열의 **1부터 시작하는 절 위치**, 값은 1~80자 이름. 미배정 절은 키를 생략한다. 전체 계획을 교체하며 최대 현재 절 수만큼 저장. 본문 revision과 독립 배정 revision 모두 일치해야 하고 오래된 변경은 `CONFLICT`로 거부한다. 배정 저장은 본문 revision·녹음을 바꾸지 않는다. 본문 저장은 배정표도 초기화(assignmentRevision `0`). 기존 상태 파일의 배정표는 빈 객체로 호환한다. F5 OFF 클라이언트는 이 API를 호출하지 않는다. 최신 Code.gs 배포 필요.

배정은 작업 순서 표시이며 쓰기 권한은 바꾸지 않는다. F2의 이름별 재녹음/잠금 정책은 독립적으로 적용한다.

## F8: 본문 가져오기

화면에서 책·장·절을 자동 분리한 뒤 기존 saveText의 title/verses/pageStarts/chapters/books 형태로 보낸다. 서버 형식 변경 없음. 저장 시 기존 녹음·잠금·배정표를 초기화한다. 관리자용 화면이지만 기존 공유키 권한 모델이며 별도 관리자 로그인은 추가하지 않는다.

## F9 묶어 읽기 (#34)

본문 `groups`는 전체 verses 배열 기준 **1부터 시작하는** `{start,end}` 배열이다. 예: `[{"start":3,"end":5}]`. 같은 장 안에서 2절 이상, 시작 순서, 겹침 없음. 나머지는 단독 절이다. 기존 데이터/생략한 saveText는 `[]`이다. getText/saveText 응답에 포함한다.

녹음 객체에는 `endVerse`가 추가된다(기존 단독 녹음은 verse와 같음). 3–5절은 `verse:3,endVerse:5`인 파일 하나이며 목록·playbackUrl·getAudio 모두 첫 절 키 3을 사용한다. uploadRecording은 `endVerse`를 함께 전송한다. 단독 절만 생략 가능하며 현재 묶음과 다르면 INVALID_REQUEST. 내부 절 4로 getAudio하면 NOT_FOUND이다.

`saveGroups` POST 요청: `{action:"saveGroups",key,revision,groups:[{start:3,end:5}],discardRecordings:false}`. 응답 data는 `{text,recordings}`. 본문 저장과 달리 범위가 바뀌지 않은 녹음은 유지한다. 범위가 바뀔 실제 녹음이 있으면 `RECORDINGS_EXIST`; 사용자에게 삭제 동의를 받은 뒤 `discardRecordings:true`로 재요청한다. 해당 파일만 Drive 휴지통으로 옮긴다. 실패·충돌이면 재조회한다. 동일 groups 저장은 변경 없음.

묶음 변경은 본문 revision과 assignmentRevision을 갱신하고 잠금을 해제한다. 이전 revision의 업로드는 CONFLICT. F2 잠금 응답/목록에도 endVerse가 있으며 범위 전체에 적용한다. F5는 첫 절의 배정으로 묶음 전체를 통일한다(첫 절 미배정이면 전체 미배정). saveAssignments에서 묶음 안의 배정이 다르면 INVALID_REQUEST.

F9는 화면 스위치이며 서버는 항상 저장된 범위를 검증한다. OFF/구형 화면이 묶음을 단독 절로 덮어쓸 수 없다. 별도 서버 속성·관리자 인증은 없고 F8과 같은 공유키 권한이다. saveText는 기존처럼 전체 음성·배정을 초기화한다.

## F10/F11 음성 변환·재전송 (#39)

최신 Code.gs로 재배포 필요. 기존 webm/ogg는 유지하며 F10 출력에 한해 `audio/wav`도 허용한다. WAV는 RIFF/WAVE, fmt 16바이트 PCM1, mono, 24000Hz, 16bit, data가 44바이트 뒤에 오는 표준 헤더이며 길이 필드를 실제 파일과 비교한다. 0초 초과/기존 5MiB 상한은 같다. 파일 확장자는 `.wav`, Drive 비공개와 재녹음 휴지통 정책도 같다.

uploadRecording 선택 필드:

| 필드 | 의미 |
| --- | --- |
| `uploadId` | 클라이언트가 한 녹음에 만든 UUID 등 영문·숫자·하이픈 8~80자. 재시도 때 동일 값 유지 |
| `expectedPrevious` | 녹음 시작 당시 해당 첫 절의 playbackUrl, 없었다면 `null`. 현재 값과 달라지면 CONFLICT |

녹음 응답/listRecordings에는 `uploadId`(구형 녹음은 null)를 추가한다. 현재 저장된 녹음과 같은 uploadId 재요청은 같은 객체를 반환하며 파일을 다시 만들지 않는다. 이 성공 확인은 소비된 F2 잠금을 다시 요구하지 않지만 공유키·현재 revision·묶음 범위 검증은 적용한다. 다른 녹음으로 교체된 뒤의 오래된 재시도는 expectedPrevious 검사로 막는다. 두 필드를 생략한 기존 클라이언트 동작은 그대로다.

F11 대기열은 폰 IndexedDB에만 저장한다. 주소+공유키의 SHA-256 범위 키를 사용하며 공유키 자체/잠금 토큰을 대기열에 저장하지 않는다. 재전송 전 listRecordings의 revision·uploadId·playbackUrl을 확인하고, listLocks.enabled이면 acquireLock으로 새 잠금을 얻어 업로드 후 해제한다. 서버의 expectedPrevious 검사가 조회/업로드 사이 경쟁도 막는다. CONFLICT/권한·형식 오류는 자동 덮어쓰기 없이 보관, 통신/BUSY/LOCKED는 나중에 재시도한다. F12/F13은 기존 조회 API만 사용하고 새 서버 속성은 없다.
