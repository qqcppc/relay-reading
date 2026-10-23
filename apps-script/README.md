# Apps Script 배포

1. Google Drive에 **비공개 전용 폴더** 생성. 폴더 주소의 ID 복사.
2. [Apps Script](https://script.google.com/) 새 프로젝트 → `Code.gs` 내용 붙여넣기.
3. 프로젝트 설정 → 스크립트 속성에 `DRIVE_FOLDER_ID`와 충분히 긴 임의의
   `API_KEY` 저장. `STATE_FILE_ID`는 자동 생성되므로 직접 설정·삭제하지 않기.
4. 배포 → 새 배포 → 웹 앱. 실행 사용자 **나**, 액세스 권한 **모든 사용자**.
   Drive 권한 승인 후 `/exec` 주소 복사. 조직 정책상 익명 배포가 막히면 관리자 확인 필요.
5. 화면 담당자에게 주소와 [API.md](API.md) 전달. 공유키는 소그룹에 별도 전달하며
   공개 HTML·저장소에 넣지 않기. 화면에서 입력받아 요청마다 전달.
6. 수정 후 배포 관리 → 수정 → **새 버전**으로 배포.

녹음과 본문 상태 JSON은 전용 Drive 폴더에만 저장. 폴더를 공개 공유하지 않기.
누구나 웹 앱에 접근할 수 있지만 데이터 작업에는 공유키 필요.
키를 아는 사람은 모두 본문 수정·재녹음 가능. 녹음 재생은 `getAudio`와 Blob URL 사용.
`playbackUrl`은 배포자용 Drive 확인 링크. 본문 저장 시 기존 녹음 전체 초기화.
재녹음·본문 초기화의 이전 파일은 Drive 휴지통으로 이동하며 영구 삭제하지 않음.
Drive 정리 실패는 Apps Script 실행 로그에 남음. 폴더나 상태 파일 수동 변경 금지.

배포 후 폰 2대로 본문 저장/조회 → webm·ogg 녹음 → 다른 폰 재생 → 같은 절 교체 →
본문 변경 후 이전 버전 업로드 거부 확인. 실제 음성 파일은 Git에 추가하지 않기.
로컬 검증: `node --test apps-script/Code.test.cjs` (Drive 서비스 모의 테스트).
실제 Google 권한·브라우저 CORS·휴대폰 재생은 배포 후 확인 필요.

참고: [웹 앱](https://developers.google.com/apps-script/guides/web),
[ContentService 리디렉션](https://developers.google.com/apps-script/guides/content).

여러 페이지 본문 기능: 최신 Code.gs로 새 버전을 배포해야 페이지 경계(pageStarts)도 저장됨. 기존 데이터는 한 페이지로 조회되며 녹음 번호는 유지됨.

책 목록 기능도 최신 Code.gs 새 버전 배포 필요. 기존 본문/녹음은 한 책으로 호환되며 책을 나누려고 본문을 재저장하면 기존 녹음이 초기화됨.
