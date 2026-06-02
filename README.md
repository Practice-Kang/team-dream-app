# 꿈꾸민턴 통합관리

꿈꾸민턴 배드민턴 모임의 출석/회원 관리 자동화와 복식 매칭 웹앱을 함께 관리하는 저장소입니다.

현재 1차 목표는 기존 Google Sheet의 `회원명단`을 읽기 전용 데이터 원본으로 사용해, 당일 참석자를 선택하고 남복/여복/혼복 복식 게임 조와 대기자를 모바일에서 빠르게 확인하는 웹앱을 만드는 것입니다.

## 참고 자료

- Google Sheet: <https://docs.google.com/spreadsheets/d/1IWyUCa6DJCJ2ET-DTNQLoEkHw9tcx42w3CWCR196dMQ>
- 유저스토리 초안: <https://knowing-vegetable-bb9.notion.site/372735f79f1d80bba2f1ecc27046a55f>
- 프로젝트 작업 지침: [AGENTS.md](./AGENTS.md)

## 디렉토리 구조

```text
.
├── AGENTS.md
├── README.md
├── apps-script/
│   └── sheet-automation/
│       ├── KMC.js
│       ├── README.md
│       ├── appsscript.json
│       ├── package.json
│       ├── package-lock.json
│       ├── .claspignore
│       └── .clasp.json.example
└── web-app/  # 추후 매칭 웹앱 구현 위치
```

## Apps Script 관리

Google Sheet에 연결된 Apps Script는 `apps-script/sheet-automation`에서 관리합니다. 자세한 설정과 운영 절차는 [apps-script/sheet-automation/README.md](./apps-script/sheet-automation/README.md)를 참고하세요.

Apps Script를 수정한 뒤 Google Sheet에 즉시 반영할 때:

```powershell
cd apps-script/sheet-automation
npm run check
npm run push
```

`clasp push --force`는 원격 Apps Script 파일을 덮어쓸 수 있으니, 변경사항을 충분히 확인한 뒤에만 사용하세요.

## 데이터 원칙

- `회원명단` 시트가 MVP의 회원 원본입니다.
- 매칭 웹앱은 MVP에서 Google Sheet를 읽기 전용으로 다룹니다.
- 출석 저장, 매칭 결과 DB 저장, 로그인, 권한 관리는 MVP 범위에서 제외합니다.
- 인증 파일, 환경 변수, 개인 데이터 export 파일은 저장소에 커밋하지 않습니다.

## 개발 방향

- 시트 읽기/파싱 로직과 매칭 알고리즘을 분리합니다.
- 매칭 알고리즘은 순수 함수 중심으로 작성하고 테스트 가능하게 유지합니다.
- 모바일 현장 사용성을 우선합니다.
- 첫 화면은 소개 페이지가 아니라 바로 사용할 수 있는 매칭 흐름이어야 합니다.
