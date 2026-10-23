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

- `npm test`: 7개 파일의 단위/API 검사(27개 사례). Apps Script·Drive는 메모리 모의 서비스, WAV도 합성 PCM 바이트만 사용한다.
- `features-smoke.cjs`: F1 연결/두 폰 F2/이름별 교체/F3 실제 SW·오프라인·공유·OFF 복귀.
- `settings-smoke.cjs`: 테마·글꼴·기억·저장 차단·모바일 시트.
- `f4-f8-smoke.cjs`: F4+F5 자동 시작/배정 동기화/F7 실제 해독/F8 입력·동의·복원.
- `f9-smoke.cjs`: 묶음 녹음/첫 절 키/범위 잠금/격자색/배정/편집·동의.
- `long-1-smoke.cjs`: F10 실제 Web Audio 무음 자르기·비교, F11 IndexedDB 재시작·두 탭·응답 유실·본문 충돌·저장 실패, F12 묶음 WAV·명시적 파일 공유, F13 장 완성·목표·복사.
- `screen-smoke.cjs`: 현재 한 줄 머리/20칸 격자 쓸기/구약·신약 4열/온기목장·설정 시트, 전체 기능 ON·OFF·교차 조합, F10~F13 스위치 재시작·복귀. `ui-smoke.cjs`는 이 검사의 호환 진입점이다.

## 390×800 화면 비교

`npm run test:visual`은 `tests/baselines/`의 6장과 비교한다. viewport 390×800, deviceScaleFactor 1, 밝은 테마, ko-KR. 애니메이션을 끄고 화면 버전 번호만 `#V`로 고정한다. 픽셀 색 차이 threshold 0.1, 전체 차이 0.3% 초과 시 실패한다. 실패 화면/차이는 git에서 제외한 `tests/results/`에 저장한다.

현재 기준: Linux(Debian 13), Chromium 154.0.8037.57, 환경 기본 글꼴(OpenAI Sans 및 한국어 대체 글꼴). 브라우저/OS/글꼴이 달라 생긴 차이는 실제 화면 변경과 구분해 검토한다. 기준을 바꿀 때는 아래 명령 후 PNG 6장을 직접 확인하고 커밋한다. 기능 조합은 같은 읽기 기준 이미지에 계속 비교한다.

```sh
UPDATE_SCREENSHOTS=1 BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:visual
```

음성은 가상 마이크·메모리 Blob·테스트용 IndexedDB만 사용한다. WAV 다운로드는 Blob URL을 메모리에서 해독하며 파일로 저장하지 않는다. 실제 녹음 파일은 저장소에 넣지 않는다. 실제 Google 배포 권한/CORS, 카톡 붙여넣기·파일 공유, iPhone/Android의 마이크·해독·설치·저장 용량은 사용자 배포 후 폰에서 별도 확인한다.
