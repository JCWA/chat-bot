# CLAUDE.md

> Claude Code 실행 지침. 세션 시작 시 반드시 이 파일을 먼저 읽는다.

---

## 세션 시작 루틴

1. `CONTEXT.md` 읽기 — 프로젝트 목적, 스택, 봇 플로우 파악
2. `TASKS.md` 읽기 — 현재 상태 및 다음 태스크 확인
3. 미완료 태스크 중 가장 번호가 낮은 것부터 순서대로 실행
4. 태스크 완료 시 즉시 `TASKS.md`의 해당 항목을 `[x]`로 업데이트
5. **코드 변경 시 관련 md 파일도 함께 업데이트** (CONTEXT.md, TASKS.md, CLAUDE.md)

---

## 코드 작성 원칙

- **언어**: TypeScript strict mode
- **스타일**: NestJS 공식 컨벤션 (모듈 / 서비스 / 게이트웨이 분리)
- **의존성**: `CONTEXT.md`의 기술 스택 외 라이브러리는 추가하지 않는다
- **환경 변수**: 하드코딩 금지. 모든 설정값은 `.env` + `process.env`로 참조
- **에러 처리**: try-catch 필수. 에러는 console.error로 로깅 후 게이트웨이에 에러 이벤트 emit
- **주석**: 복잡한 로직에만 한국어 주석 허용. 자명한 코드에는 주석 불필요

---

## 파일 작업 규칙

- 새 파일 작성 전 해당 경로가 존재하는지 확인
- 기존 파일 덮어쓰기 전 내용 확인 후 수행
- `src/` 외부 파일(TASKS.md, CONTEXT.md, CLAUDE.md)은 내용 업데이트 외 삭제 금지

---

## 터미널 명령 규칙

- 패키지 설치: `npm install` (yarn, pnpm 사용 금지)
- 빌드 확인: `npm run build`
- 개발 서버: `npm run start:dev`
- 프로덕션 서버: `npm run build && npm run start` (dist/ 기반)
- 명령 실행 전 현재 디렉토리가 `/Users/channy/Documents/spaceoddity/chat-bot`인지 확인

---

## 금지 사항

- `chat-server` 원본 코드 직접 복사 금지 — 참고만 허용
- TypeORM, PostgreSQL 관련 패키지 설치 금지
- 세션 기반 인증 코드 작성 금지
- `any` 타입 남용 금지 — 불가피한 경우 `// eslint-disable-next-line` 주석 추가

---

## 시행착오에서 배운 규칙

### 외부 API
- **새 API 연동 시 curl로 먼저 테스트**하고 코드 작성 (e약은요 API 키 미승인 사례)
- 공공데이터 API 응답에 중복 데이터가 올 수 있음 → 항상 dedup 처리
- Groq 무료 티어는 분당 30요청 제한 → 레이트 리밋 고려

### 데이터 파이프라인
- 대량 처리 시 중단/재개(resume) 로직 필수 — 이미 처리된 건 스킵
- 임베딩 배치에서 Supabase upsert 시 같은 배치 내 중복 item_seq 제거 필요

### LLM
- temperature 미설정 시 할루시네이션 발생 → 0.3 권장
- 정형 데이터(이미지, 약 목록)는 LLM에 맡기지 말고 코드로 직접 전달
- 한글 전용 출력 규칙 + sanitizeResponse() 후처리 필수

### Supabase
- `.or()` 체이닝은 AND가 아님 → 정확한 AND 검색은 RPC 함수로
- `CREATE OR REPLACE FUNCTION`으로 반환 타입 변경 불가 → `DROP FUNCTION` 먼저 실행
- RPC 반환 타입 변경 시 마이그레이션에 DROP + CREATE 포함

### 검색
- ILIKE 검색에 짧은 토큰(2자 이하) 사용 시 과매칭 → 최소 3자 또는 정확 매칭
- 식별문자 1글자는 정확 매칭(eq), 3자 이상은 부분 매칭(ilike)

### 빌드/배포
- `npm run start`는 dist/ 실행 → 반드시 `npm run build` 후 시작
- watch 모드(`start:dev`)에서 변경 반영 안 되면 서버 완전 재시작

---

## 태스크 실행 템플릿

```
1. TASKS.md에서 태스크 내용 확인
2. 필요한 파일 경로 확인 (Glob 툴)
3. 코드 작성 (Write / Edit 툴)
4. 빌드/린트 에러 확인 (npm run build)
5. TASKS.md 해당 항목 [x] 체크
6. 관련 md 파일 업데이트 (CONTEXT.md 등)
7. 다음 태스크로 이동
```

---

## 컨텍스트 소진 시 대응

Claude Code 세션이 컨텍스트 한계에 가까워지면:
1. 현재 작업 중인 파일 저장 확인
2. `TASKS.md` 현재 상태 업데이트 (완료된 태스크 체크)
3. "세션 종료 — TASK-XX까지 완료" 메시지 출력
4. 다음 세션에서 이 파일을 읽고 재개
