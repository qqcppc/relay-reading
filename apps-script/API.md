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
