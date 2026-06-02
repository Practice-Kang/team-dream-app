# 꿈꾸민턴 매칭 웹앱

Vue 3 + Cloudflare Pages 기반의 모바일 우선 복식 매칭 웹앱입니다.

## 개발 환경

- Node.js `22.12.0` 이상
- npm

Apps Script 관리는 저장소의 `apps-script/sheet-automation`에서 Node 10 + clasp 2.x 기준으로 따로 다룹니다.

프로젝트 안에서 `npm install`, `npm run dev`가 자동으로 Node 22/npm 11을 쓰게 하려면 Volta 사용을 권장합니다. 이 프로젝트는 `package.json`의 `volta` 필드에 Node/npm 버전을 고정합니다.

최초 1회 설정:

```powershell
winget install Volta.Volta
# 설치 직후에는 PowerShell을 완전히 닫고 새로 엽니다.
volta install node@22.12.0 npm@11.16.0
```

## 시작

```powershell
cd web-app
npm install
npm run dev
```

Volta를 쓰지 않는 환경에서는 Node.js 22.12.0 이상이 활성화된 터미널에서 실행하세요. Node 10/npm 6 터미널은 Apps Script clasp 작업 전용으로만 사용합니다.

## 주요 명령

```powershell
npm run build
npm run test
npm run cf:dev
```

## 디렉터리

```text
src/
  matching/  # 순수 매칭 로직
  shared/    # 앱과 Cloudflare Functions가 공유하는 타입/파서
  stores/    # Pinia 상태
  views/     # 운영자/멤버 화면
functions/   # Cloudflare Pages Functions
migrations/  # Cloudflare D1 마이그레이션
```
