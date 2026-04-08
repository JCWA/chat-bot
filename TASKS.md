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

---

## Phase 8: e약은요 연동

- [x] **TASK-21** DB 스키마에 efcy, use_method, side_effect 등 6개 컬럼 추가
- [x] **TASK-22** ingestion.service.ts — runDrugInfo() e약은요 수집
- [x] **TASK-23** classSearch에 efcy 컬럼 검색 추가
- [x] **TASK-24** 시스템 프롬프트에 효능/용법/부작용 답변 허용
- [x] **TASK-25** match_medicines RPC에 efcy, use_method, side_effect, item_image 추가

---

## Phase 9: 프론트 개선

- [x] **TASK-26** SEO — 메타태그, OG, robots.txt, sitemap.xml, lang="ko"
- [x] **TASK-27** 반응형 — 모바일 breakpoint, 시맨틱 HTML, 접근성
- [x] **TASK-28** 사용법 안내 화면 + 예시 질문 버튼
- [x] **TASK-29** 약 카드 UI (이미지 + 정보) — WebSocket으로 medicines 전달
- [x] **TASK-30** 카드 클릭 시 해당 약 상세 검색

---

## Phase 10: 미완료

- [ ] **TASK-31** search_by_appearance RPC 정확도 추가 개선 (1~2자 식별문자 정확 매칭 검증)
- [ ] **TASK-32** Groq 레이트 리밋 대응 (재시도 로직 또는 모델 변경)
- [ ] **TASK-33** CONTEXT.md, TASKS.md, CLAUDE.md 최신화 → 완료
- [ ] **TASK-34** Railway 백엔드 배포
- [ ] **TASK-35** Vercel 프론트 배포 연동 확인
- [ ] **TASK-36** E2E 연결 테스트

---

## 현재 상태

**마지막 완료 태스크**: TASK-33 (md 파일 최신화)
**다음 실행할 태스크**: TASK-31 (검색 정확도 추가 개선)
