# 화면 ↔ 저장 API

단일 본문을 공유한다. 절 번호 `verse`는 **1부터 시작**한다. 본문 수정 시 기존 녹음은 전부 삭제한다(절 번호가 달라지는 문제 방지). 제목/절 내용이 같으면 유지한다.

## 호출

웹 앱 `/exec` 주소 사용. GET은 URL 쿼리, POST는 JSON 문자열을 **`Content-Type: text/plain;charset=utf-8`** 로 전송한다. Apps Script는 JSON Content-Type의 CORS 사전 요청을 처리하지 못하므로 text/plain 사용. 리다이렉트를 따라가고 응답 JSON의 `ok`를 확인한다(오류도 HTTP 200).

- 성공: `{"ok":true,"data": ...}`
- 실패: `{"ok":false,"error":{"code":"INVALID_REQUEST","message":"..."}}`
- 오류 코드: `INVALID_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `BUSY`, `NOT_CONFIGURED`, `INTERNAL_ERROR`
- 모든 요청에 공유 암호 `token` 필요. GET은 쿼리, POST는 본문에 포함. 공개 저장소/소스에 암호를 넣지 말고 사용자 입력으로 받는다. GET URL에 암호가 포함되므로 링크 공유/로그에 주의. 조회도 POST로 가능.

## 본문

GET `?action=getText&token=...`

```json
{"ok":true,"data":{"title":"애국가","verses":["동해 물과 백두산이","마르고 닳도록"],"updatedAt":"2026-10-23T00:00:00.000Z"}}
```

처음에는 `title: ""`, `verses: []`, `updatedAt: null`.

POST `{"action":"saveText","token":"...","title":"애국가","verses":["동해 물과 백두산이","마르고 닳도록"]}` → 저장된 본문 반환. 제목 200자, 절 1~500개, 절당 5,000자, 전체 JSON UTF-8 200KB 이하. 빈 제목/절 거부.

## 녹음 저장/교체

POST:
```json
{"action":"uploadRecording","token":"...","verse":1,"reader":"민수","mimeType":"audio/webm;codecs=opus","audioBase64":"BASE64_ONLY"}
```

`audio/webm`, `audio/ogg` 및 codecs 매개변수 허용. Data URL 접두사 없이 base64만 전송. 디코딩된 파일 최대 10MiB. 읽은 사람 이름 80자 이하. 기존 본문의 절만 저장 가능. 같은 절은 마지막으로 완료된 업로드로 교체. 동시 쓰기는 서버 잠금으로 순차 처리. 교체된 Drive 파일은 휴지통으로 이동.

응답 `data`는 아래 목록의 녹음 항목 하나.

## 녹음 목록

GET `?action=listRecordings&token=...`
```json
{"ok":true,"data":{"recordings":[{"verse":1,"reader":"민수","playbackUrl":"https://script.google.com/macros/s/DEPLOYMENT/exec?action=getAudio&verse=1","recordedAt":"2026-10-23T00:00:00.000Z","mimeType":"audio/webm"}]}}
```

절 번호 오름차순. 녹음 없는 절은 생략. `playbackUrl`은 **오디오 바이트가 아니라 JSON 음성 조회 주소**이며 암호는 포함하지 않는다. 이 주소에 `token` 쿼리를 추가해 조회하거나, 같은 웹 앱에 POST `{"action":"getAudio","token":"...","verse":1}` 호출.

응답: `{"ok":true,"data":{"mimeType":"audio/webm","audioBase64":"..."}}`.
화면에서 base64를 바이트 배열로 디코딩 → `new Blob([bytes], {type: mimeType})` → `URL.createObjectURL(blob)`을 `<audio src>`에 사용하고 사용 후 `URL.revokeObjectURL` 호출. Drive 파일은 비공개이고 직접 공개 다운로드 링크는 만들지 않는다. JSON 응답 주소를 `<audio src>`에 바로 넣으면 안 된다.

POST로 조회할 때 `action`은 `getText`, `listRecordings`, `getAudio` 그대로 사용. JSONP 미지원. 암호를 아는 그룹원은 본문/녹음을 읽고 교체할 수 있으며 사용자별 권한/동시 녹음 예약은 이번 범위 밖.
