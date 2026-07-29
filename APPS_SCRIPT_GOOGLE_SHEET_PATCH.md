# 팔로우리스트 잠금·비밀번호 Google Sheet 연동 패치

이 파일은 GitHub 파일이 아니라 **현재 사용 중인 Google Apps Script의 Code.gs**에 반영해야 합니다.
프런트 앱은 아래 action을 사용합니다.

- `verifyFollowPassword`
- `setFollowLock`
- `changeFollowPassword`
- `publicConfig` 응답의 `followLocked`

## 1. 설정 시트 자동 생성 함수 추가

```javascript
const SETTINGS_SHEET_NAME = '설정';

function getSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.getRange('A1:B1').setValues([['KEY', 'VALUE']]);
    sheet.getRange('A2:B3').setValues([
      ['followListLock', 'FALSE'],
      ['followListPassword', '2132']
    ]);
  }
  return sheet;
}

function getSetting_(key, fallback) {
  const sheet = getSettingsSheet_();
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 2).getDisplayValues();
  const row = values.find(r => String(r[0]).trim() === key);
  return row ? String(row[1]).trim() : String(fallback ?? '');
}

function setSetting_(key, value) {
  const sheet = getSettingsSheet_();
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues() : [];
  const index = values.findIndex(r => String(r[0]).trim() === key);
  if (index >= 0) {
    sheet.getRange(index + 2, 2).setValue(String(value));
  } else {
    sheet.appendRow([key, String(value)]);
  }
}

function followLocked_() {
  return getSetting_('followListLock', 'FALSE').toUpperCase() === 'TRUE';
}
```

## 2. publicConfig 응답에 followLocked 추가

기존 `publicConfig` 응답 객체 안에 아래 한 줄을 추가합니다.

```javascript
followLocked: followLocked_(),
```

예시:

```javascript
return ok_({
  appLocked: appLocked,
  matchLocked: matchLocked,
  followLocked: followLocked_(),
  securityVersion: securityVersion,
  version: version,
  forceUpdate: forceUpdate
});
```

## 3. POST action 분기 추가

현재 `doPost(e)` 또는 POST action 처리 switch 안에 아래 3개 분기를 추가합니다.
`requireAdmin_(p.adminPassword)` 부분은 기존 프로젝트에서 운영진 비밀번호를 검사하는 함수명으로 맞추세요.
`ok_()`와 `fail_()`도 기존 응답 함수명을 그대로 사용하세요.

```javascript
case 'verifyFollowPassword': {
  const password = String(p.password || '').trim();
  const saved = getSetting_('followListPassword', '2132');
  if (!password || password !== saved) throw new Error('팔로우리스트 비밀번호가 올바르지 않습니다.');
  return ok_({ verified: true });
}

case 'setFollowLock': {
  requireAdmin_(p.adminPassword);
  const locked = String(p.locked).toLowerCase() === 'true';
  setSetting_('followListLock', locked ? 'TRUE' : 'FALSE');
  bumpSecurityVersion_();
  return ok_({ followLocked: locked });
}

case 'changeFollowPassword': {
  requireAdmin_(p.adminPassword);
  const newPassword = String(p.newPassword || '').trim();
  if (!newPassword) throw new Error('새 팔로우리스트 비밀번호를 입력해 주세요.');
  setSetting_('followListPassword', newPassword);
  bumpSecurityVersion_();
  return ok_({ changed: true });
}
```

> 기존 코드에서 보안 버전을 갱신하는 함수명이 `bumpSecurityVersion_()`가 아니라면, 앱·맞팔 비밀번호 변경 시 쓰는 동일한 갱신 코드를 넣으세요.

## 4. Apps Script 재배포

1. Apps Script에서 **배포 → 배포 관리**
2. 연필 아이콘 → **새 버전**
3. 실행 사용자: 나
4. 액세스 권한: 모든 사용자
5. 배포

웹 앱 URL이 기존 URL과 같으면 `config.json`은 바꿀 필요가 없습니다.

## 5. Google Sheet에서 직접 변경

패치 후 구글시트에 `설정` 탭이 생깁니다.

| KEY | VALUE |
|---|---|
| followListLock | TRUE 또는 FALSE |
| followListPassword | 원하는 비밀번호 |

- `TRUE`: 팔로우리스트 잠금
- `FALSE`: 팔로우리스트 바로 이용
- 비밀번호는 VALUE 셀에서 직접 수정 가능

운영진 화면에서 변경해도 같은 `설정` 시트 값이 변경됩니다.
