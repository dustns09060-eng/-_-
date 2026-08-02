V36 API ONLY 계획

이 프로젝트는 CSV 기반 코드를 제거하고 Apps Script API 전용 구조로
리팩터링하는 것이 목표입니다.

현재 이 작업 환경에서는 프로젝트를 실행하며 app.js/index.html의
모든 연관 코드를 안전하게 검증할 수 없으므로, 자동으로 완전한
리팩터링을 수행하면 앱을 망가뜨릴 위험이 있습니다.

권장 변경:
- room-list.csv 제거
- fallbackCsv 제거
- app.js의 CSV fallback 로직 제거
- Apps Script roomList API만 사용
- localStorage 캐시 추가
- 서비스워커 캐시 최적화
