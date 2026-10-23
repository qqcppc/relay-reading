# 화면 연결 (1차)

`index.html#url=인코딩한_웹앱주소&key=인코딩한_공유키` 링크로 접속하면 이 폰 브라우저에 연결 정보를 기억하고 주소의 fragment를 제거한다. 각 값은 `encodeURIComponent`로 인코딩. 웹 앱 주소는 `https://script.google.com/macros/s/배포ID/exec` 형식만 허용. 링크와 키는 그룹 안에서만 안전하게 전달. 키는 브라우저 localStorage에 저장되므로 공용 기기에서는 **연결 지우고 시험 모드** 사용. 이름은 별도 기억.

주소·키 없으면 기존 폰 안의 시험 모드. 공유 연결 시 현재는 **본문·녹음 목록 조회만** 가능하며 녹음·재생 버튼은 비활성화한다. 잘못된 키/통신 오류는 연결 실패로 표시하며 시험 모드로 몰래 전환하지 않는다. 서버의 빈 본문도 그대로 표시한다.

다음 작업: 공유 녹음 업로드/재녹음, getAudio 재생·이어듣기, 본문 편집과 녹음 삭제 확인. API 호출은 storage.js의 RelayStorage.request에 모은다. revision 충돌 처리 필요.

검증:
- `node --test tests/storage.test.cjs`: 연결 정보 검증, fragment 삭제, 이름 기억, POST 계약, revision 재조회, 인증 오류.
- `node tests/ui-smoke.cjs`: Playwright와 Chromium 설치된 환경에서 화면 모의 smoke test. 실제 Google 배포의 CORS/마이크/폰 재생 검증은 별도 필요.
