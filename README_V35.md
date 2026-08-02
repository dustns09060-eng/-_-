# 여우방 V35 Stable

## 시트 연결
- `팔로우리스트` 탭: 팔로우리스트 화면
- `맞팔확인용` 탭: ZIP 맞팔 분석 기준 명단
- `설정`, `공지`, `관리자로그` 탭: 기존 기능 유지

## 적용된 변경
- CSV 버튼 및 CSV 생성 기능 제거
- 팔로우리스트와 맞팔확인 기준 명단 분리
- 첫 접속에는 팔로우리스트만 불러오고, 맞팔용 명단은 분석할 때 불러옴
- 60초마다 2천 명 명단을 다시 요청하던 동작 제거
- Apps Script 명단 캐시 5분 적용
- CacheService 용량 제한 대응을 위한 분할 캐시 적용
- 잠금·비밀번호·운영진·공지 기능 유지
- 버전: V35 / 정적 캐시: 350

## 배포 순서
1. Apps Script에서 기존 코드를 `Code.gs` 내용으로 전체 교체
2. `setupYeowoobang` 한 번 실행
3. 웹앱을 새 버전으로 다시 배포
4. GitHub 저장소에 나머지 파일을 모두 덮어쓰기
5. `https://dustns09060-eng.github.io/ys/?v=350`으로 확인

## 확인할 API
- `?action=publicConfig`
- `?action=followList`
- `?action=matchList`
