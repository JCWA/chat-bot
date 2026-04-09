# TASKS.md

> Claude Code 세션 간 상태 추적용 파일. 태스크 완료 시 `[ ]` → `[x]`로 변경.
> 세션이 끊기면 이 파일을 읽고 다음 미완료 태스크부터 재개한다.

---

## Phase 1: 프로젝트 초기 세팅

- [x] **TASK-01** package.json, tsconfig.json, nest-cli.json, .env.example 생성
- [x] **TASK-02** src/main.ts, src/app.module.ts 작성

---

## Phase 2: Bot 서비스

- [x] **TASK-03** bot.service.ts — 인메모리 컨텍스트 + Groq API 호출
- [x] **TASK-04** bot.module.ts

---

## Phase 3: Chat Gateway

- [x] **TASK-05** chat.gateway.ts — WebSocket 메시지 처리
- [x] **TASK-06** chat.module.ts

---

## Phase 4: 검증

- [x] **TASK-07** 빌드/소켓 테스트/멀티턴 확인

---

## Phase 5: RAG 파이프라인

- [x] **TASK-08** Supabase pgvector 스키마 (database/schema.sql)
- [x] **TASK-09** embedding.service.ts — HF Inference API
- [x] **TASK-10** retrieval.service.ts — 하이브리드 검색
- [x] **TASK-11** BotService에 RAG 컨텍스트 주입
- [x] **TASK-12** ingestion — 공공데이터 수집 + 배치 임베딩 + upsert

---

## Phase 6: 프론트엔드

- [x] **TASK-13** Next.js 16 + Tailwind 초기 세팅 (/chat-bot-web)
- [x] **TASK-14** useChat 훅 + ChatWindow 컴포넌트
- [x] **TASK-15** 봇 타이핑 인디케이터

---

## Phase 7: 품질 개선

- [x] **TASK-16** 할루시네이션 방지 (temperature 0.3, 시스템 프롬프트 강화)
- [x] **TASK-17** 문자열 깨짐 수정 (sanitizeResponse, 한글 전용 규칙)
- [x] **TASK-18** 검색 오매칭 수정 (토큰 최소 길이, threshold 상향)
- [x] **TASK-19** 임베딩 중단/재개 지원 (getExistingSeqs, 스킵 로직)
- [x] **TASK-20** search_by_appearance RPC — 색상+모양+식별문자 AND 검색
- [x] **TASK-21** 불용어 어간 기반 정규식 패턴 제거
- [x] **TASK-22** 검색 결과 혼합 방지 (단계별 독립 반환)
- [x] **TASK-23** 없는 결과일 때 카드 미표시

---

## Phase 8: e약은요 연동

- [x] **TASK-24** DB 스키마에 efcy, use_method, side_effect 등 6개 컬럼 추가
- [x] **TASK-25** ingestion.service.ts — runDrugInfo() e약은요 페이지 단위 수집
- [x] **TASK-26** classSearch에 efcy 컬럼 검색 추가
- [x] **TASK-27** 시스템 프롬프트에 효능/용법/부작용 답변 허용
- [x] **TASK-28** match_medicines RPC에 efcy, use_method, side_effect, item_image 추가

---

## Phase 9: 프론트 개선

- [x] **TASK-29** SEO — 메타태그, OG, robots.txt, sitemap.xml, lang="ko"
- [x] **TASK-30** 반응형 — 모바일 breakpoint, 시맨틱 HTML, 접근성
- [x] **TASK-31** 사용법 안내 화면 + 예시 질문 버튼
- [x] **TASK-32** 약 카드 UI (이미지 + 정보) — WebSocket으로 medicines 전달
- [x] **TASK-33** 카드 클릭 시 해당 약 상세 검색
- [x] **TASK-34** 모바일 카드 가로 스크롤 (overflow-hidden wrapper)
- [x] **TASK-35** LLM 레이트 리밋 시 구분된 에러 메시지

---

## Phase 10: 성능 최적화

- [x] **TASK-36** LLM 모델 변경 (llama-3.3-70b → llama-3.1-8b-instant)
- [x] **TASK-37** RAG 컨텍스트 축소 (5건→3건, 텍스트 길이 제한)
- [x] **TASK-38** 대화 히스토리 20개 → 4개 축소

---

## Phase 11: 배포

- [x] **TASK-39** Railway 백엔드 배포
- [x] **TASK-40** Vercel 프론트 배포
- [x] **TASK-41** E2E 연결 테스트

---

## Phase 12: 부가 기능

- [x] **TASK-42** 방문자 Slack 알림 (IP + 리퍼러 + 시간)
- [x] **TASK-43** CONTEXT.md, TASKS.md, CLAUDE.md 최신화

---

## Phase 13: 보안/안정성 개선

- [x] **TASK-44** 대화 메모리 TTL 30분 + 5분 주기 만료 정리
- [x] **TASK-45** Groq API 30초 타임아웃 (AbortController)
- [x] **TASK-46** 메시지 길이 500자 제한
- [x] **TASK-47** CORS 허용 도메인 제한 (Vercel + localhost)
- [x] **TASK-48** Socket transport websocket 우선
- [x] **TASK-49** 이미지 로드 실패 시 숨김 처리

---

## 현재 상태

**모든 태스크 완료**
**마지막 완료 태스크**: TASK-49
