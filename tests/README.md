# 테스트 실행

저장소 루트에서 Node.js 24 이상 사용. 화면은 정적 파일이라 앱 빌드/실행 의존성은 없다. 테스트 도구만 설치한다.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

시스템 Chromium을 쓸 경우:

```sh
BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

- `npm test`: 10개 파일의 단위/API 검사(38개 사례). Apps Script·Drive는 메모리 모의 서비스, WAV도 합성 PCM 바이트만 사용한다.
- `features-smoke.cjs`: F1 연결/두 폰 F2/이름별 교체/F3 실제 SW·오프라인·공유·OFF 복귀.
- `settings-smoke.cjs`: 테마·글꼴·기억·저장 차단·모바일 시트.
- `f4-f8-smoke.cjs`: F4+F5 자동 시작/배정 동기화/F7 실제 해독/F8 입력·동의·복원.
- `f9-smoke.cjs`: 묶음 녹음/첫 절 키/범위 잠금/격자색/배정/편집·동의.
- `long-1-smoke.cjs`: F10 실제 Web Audio 무음 자르기·비교, F11 IndexedDB 재시작·두 탭·응답 유실·본문 충돌·저장 실패, F12 묶음 WAV·명시적 파일 공유, F13 장 완성·목표·복사.
- `bg-seed-smoke.cjs`: F14 A~J·스크롤·동작 줄이기·다크·그림 오프라인 캐시, 빈 공유 본문의 F8 직접 진입, UTF-8/UTF-16 파일·오류·늦은 읽기·저장 동의. A~J와 다크 확인 화면은 `tests/results/background-*.png`에 생성한다. 실제 성경 본문은 테스트에 넣지 않는다.
- `drafts-smoke.cjs`: 입력/파일 초안의 새로고침·스위치 재시작 복원, 저장 성공 정리, 서버 목록 갱신 중 입력 보존, 그룹 범위·삭제·저장 실패 이탈 경고.
- `picker-progress-smoke.cjs`: 가짜 예약 없음/실제 F2 잠금·사람 색·해제, 책·장 실제 절 비율/묶음/대기·연출 제외/완료 표시.
- `f15-smoke.cjs`: 실제 Web Audio 그래프를 OfflineAudioContext로 렌더해 음악 덕킹/회복과 피크 확인. 절별 음량·여백·반복, 장 경계 음악 전환/음악 없음, 재생 중 음량 변경, 폰 파일 기억/잘못된 파일/삭제, 정적 곡 캐시, 읽기 취소/마이크 시작/버전 충돌 검증. 음악·목소리는 합성 PCM 메모리 바이트만 사용한다.
- `basics-smoke.cjs`: 세로→가로 쓸기 차단, 머리 한 번/길게, 한 번 이동/두 번 녹음/길게 선택·범위 복사·폰 뒤로가기, 본인/타인·묶음 삭제와 확인 횟수, 전체 듣기 가운데 따라가기, 마이크/카톡 안내. 서버 테스트는 기기 비밀값·이름·갱신 충돌·잠금·기존 미등록 녹음을 따로 확인한다.
- `screen-smoke.cjs`: 현재 겹친 책·장 머리/20칸 격자 쓸기/구약·신약 4열/머리 길게 눌러 사람·설정 시트, 전체 기능 ON·OFF·교차 조합, F10~F15 스위치 재시작·복귀. `ui-smoke.cjs`는 이 검사의 호환 진입점이다.

## 390×800 화면 비교

`npm run test:visual`은 `tests/baselines/`의 6장과 비교한다. viewport 390×800, deviceScaleFactor 1, 밝은 테마, ko-KR. 애니메이션을 끄고 화면 버전 번호만 `#V`로 고정한다. 픽셀 색 차이 threshold 0.1, 전체 차이 0.3% 초과 시 실패한다. 실패 화면/차이는 git에서 제외한 `tests/results/`에 저장한다.

현재 기준: Linux(Debian 13), Chromium 154.0.8037.57, 환경 기본 글꼴(OpenAI Sans 및 한국어 대체 글꼴). 브라우저/OS/글꼴이 달라 생긴 차이는 실제 화면 변경과 구분해 검토한다. 기준을 바꿀 때는 아래 명령 후 PNG 6장을 직접 확인하고 커밋한다. 기능 조합은 같은 읽기 기준 이미지에 계속 비교한다.

```sh
UPDATE_SCREENSHOTS=1 BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:visual
```

음성은 가상 마이크·메모리 Blob·테스트용 IndexedDB만 사용한다. WAV 다운로드는 Blob URL을 메모리에서 해독하며 파일로 저장하지 않는다. 실제 녹음 파일은 저장소에 넣지 않는다. 실제 Google 배포 권한/CORS, 카톡 붙여넣기·파일 공유, iPhone/Android의 마이크·해독·설치·저장 용량은 사용자 배포 후 폰에서 별도 확인한다.
