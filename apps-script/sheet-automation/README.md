# 꿈꾸민턴 시트 자동화 Apps Script

이 폴더는 꿈꾸민턴 Google Sheet에 연결된 Apps Script를 git으로 관리하기 위한 공간입니다.

## 현재 코드

- `Code.gs`: Google Sheet `관리 자동화` 탭의 `Apps Script` 섹션에서 가져온 코드입니다.
- `appsscript.json`: 로컬 관리를 위한 기본 manifest입니다. 실제 Apps Script 프로젝트의 manifest와 다를 수 있으므로, `clasp pull` 후 차이를 확인하세요.
- `.clasp.json.example`: Script ID를 채워 `.clasp.json`으로 복사해 사용하는 예시 파일입니다.

## clasp 연결

Google Apps Script API를 켠 뒤, 이 폴더에서 다음 순서로 연결합니다.

```powershell
npm install -g @google/clasp
clasp login
Copy-Item .clasp.json.example .clasp.json
```

`.clasp.json`의 `scriptId`에는 Apps Script 편집기 > 프로젝트 설정 > Script ID 값을 넣습니다.

## 작업 흐름

```powershell
clasp status
clasp pull
git diff
```

수정 후 반영:

```powershell
clasp push
```

원격 편집기와 로컬 파일이 엇갈릴 수 있으니, 운영 중에는 한 번에 하나의 출처만 수정하는 것을 권장합니다. 저장소를 기준으로 삼는다면 Apps Script 편집기에서 직접 수정한 내용은 반드시 `clasp pull`로 먼저 가져오세요.
