# Apps Script 팔로우리스트 전용 비밀번호 패치

이 GitHub 파일은 아래 API 동작을 사용합니다. 현재 Apps Script 프로젝트에 같은 방식으로 추가한 뒤 새 배포해야 합니다.

## 1. 기본 비밀번호 초기화
Apps Script 편집기에서 아래 함수를 한 번 실행하세요. 원하는 초기 비밀번호로 바꿔도 됩니다.

```javascript
function initializeFollowPassword() {
  PropertiesService.getScriptProperties().setProperty('FOLLOW_PASSWORD', '2132');
}
```

## 2. doPost(e)의 action 분기 안에 추가

```javascript
if (action === 'verifyFollowPassword') {
  const saved = PropertiesService.getScriptProperties().getProperty('FOLLOW_PASSWORD') || '2132';
  if (String(e.parameter.password || '') !== saved) throw new Error('비밀번호가 올바르지 않습니다.');
  return jsonResponse({ ok: true });
}

if (action === 'changeFollowPassword') {
  verifyAdminPassword(e.parameter.adminPassword); // 기존 운영진 인증 함수명에 맞게 사용
  const next = String(e.parameter.newPassword || '').trim();
  if (!next) throw new Error('새 비밀번호를 입력해 주세요.');
  PropertiesService.getScriptProperties().setProperty('FOLLOW_PASSWORD', next);
  bumpSecurityVersion(); // 기존 보안 버전 갱신 함수가 있으면 호출
  return jsonResponse({ ok: true });
}
```

`jsonResponse`, `verifyAdminPassword`, `bumpSecurityVersion`은 현재 프로젝트에서 사용하는 기존 함수명에 맞게 연결하세요.

## 3. 새 배포
배포 → 배포 관리 → 수정 → 새 버전 → 배포 순서로 반영하세요. URL이 바뀌면 config.json의 apiUrl도 새 주소로 변경합니다.
