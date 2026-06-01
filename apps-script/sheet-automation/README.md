# 꿈꾸민턴 시트 자동화 Apps Script

이 폴더는 꿈꾸민턴 Google Sheet에 연결된 Apps Script를 git으로 관리하기 위한 공간입니다.

## 현재 코드

- `Code.gs`: Google Sheet `관리 자동화` 탭의 `Apps Script` 섹션에서 가져온 코드입니다.
- `appsscript.json`: 로컬 관리를 위한 기본 manifest입니다. 실제 Apps Script 프로젝트의 manifest와 다를 수 있으므로, `clasp pull` 후 차이를 확인하세요.
- `.clasp.json.example`: Script ID를 채워 `.clasp.json`으로 복사해 사용하는 예시 파일입니다.

## clasp 연결

Google Apps Script API를 켠 뒤, 이 폴더에서 다음 순서로 연결합니다.

```powershell
npm install
npm run login
Copy-Item .clasp.json.example .clasp.json
```

`.clasp.json`의 `scriptId`에는 Apps Script 편집기 > 프로젝트 설정 > Script ID 값을 넣습니다.

이 PC에서 `npm`이 잡히지 않으면 Node.js LTS를 설치한 뒤 새 터미널에서 다시 실행하세요.

## 작업 흐름

처음 연결할 때는 로컬 코드가 git에 커밋되어 있는지 먼저 확인합니다. `clasp pull`은 원격 Apps Script 파일을 로컬에 덮어쓸 수 있으므로, 반드시 `git status`가 깨끗한 상태에서 실행하세요.

```powershell
npm run status
npm run pull
git diff
```

수정 후 반영:

```powershell
npm run push
```

원격 편집기와 로컬 파일이 엇갈릴 수 있으니, 운영 중에는 한 번에 하나의 출처만 수정하는 것을 권장합니다. 저장소를 기준으로 삼는다면 Apps Script 편집기에서 직접 수정한 내용은 반드시 `npm run pull`로 먼저 가져오세요.

## 권장 운영 규칙

1. Apps Script 편집기는 실행, 로그 확인, 트리거 확인 용도로만 사용합니다.
2. 코드 수정은 이 폴더의 `Code.gs`에서 합니다.
3. 수정 후 `node --check Code.gs` 또는 Apps Script 편집기의 실행으로 기본 오류를 확인합니다.
4. `git diff`로 변경사항을 리뷰합니다.
5. `npm run push`로 Apps Script에 반영합니다.
6. 시트에서 실제 동작을 확인한 뒤 git commit/push 합니다.
