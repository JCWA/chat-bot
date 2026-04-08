# TASKS.md

> Claude Code 세션 간 상태 추적용 파일. 태스크 완료 시 `[ ]` → `[x]`로 변경.
> 세션이 끊기면 이 파일을 읽고 다음 미완료 태스크부터 재개한다.

---

## Phase 1: 프로젝트 초기 세팅 [백엔드 에이전트]

- [x] **TASK-01** `package.json` 생성
  - 의존성: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `reflect-metadata`, `rxjs`
  - devDependencies: `@nestjs/cli`, `typescript`, `ts-node`, `tsconfig-paths`
- [x] **TASK-02** `tsconfig.json`, `nest-cli.json`, `.env.example` 생성
  - chat-server의 tsconfig.json 구조 참고
- [x] **TASK-03** `src/main.ts` 작성
  - NestFactory 부트스트랩, CORS 전체 허용, PORT 환경 변수
  - Redis 어댑터 없이 기본 Socket.io 어댑터 사용
- [x] **TASK-04** `src/app.module.ts` 작성 — ChatModule, BotModule import

---

## Phase 2: Bot 서비스 [백엔드 에이전트]

- [x] **TASK-05** `src/bot/bot.service.ts` 작성
  - 인메모리 `Map<string, Message[]>` 컨텍스트 관리
  - `respond(chatId: string, userMessage: string): Promise<string>` 메서드
  - Groq API fetch 호출 (`llama-3.3-70b-versatile`)
  - 컨텍스트 최대 `BOT_CONTEXT_LIMIT`개 유지 (초과 시 앞부터 제거)
- [x] **TASK-06** `src/bot/bot.module.ts` 작성

---

## Phase 3: Chat Gateway [백엔드 에이전트]

- [x] **TASK-07** `src/chat/chat.gateway.ts` 작성
  - 네임스페이스: `/^\/chat\/\d+$/` (chat-server와 동일)
  - CORS: origin 전체 허용
  - `handleConnection`: `userId` 쿼리 파라미터 추출, 로그
  - `handleDisconnect`: 로그
  - `handleSendMessage(payload: { message: string; chatId?: number })`:
    1. `emit('receiveMessage', { userId, message })` — 유저 메시지 브로드캐스트
    2. `BotService.respond(chatId, message)` 호출
    3. `emit('receiveMessage', { userId: 'bot', message: botReply })` — 봇 응답 브로드캐스트
  - `handleStartTyping`: namespace에서 chatId 추출, `typingStarted` emit
  - `handleEndTyping`: `typingEnded` emit
- [x] **TASK-08** `src/chat/chat.module.ts` 작성

---

## Phase 4: 검증 [QA 에이전트]

- [x] **TASK-09** `npm run build` 빌드 에러 없음 확인
- [x] **TASK-10** `npm run start:dev` 실행 후 Socket.io 클라이언트로 수동 테스트
  - `/chat/1` 네임스페이스 접속 (`userId=test` 쿼리 파라미터)
  - `sendMessage` emit → `receiveMessage` 수신 확인 (유저 + 봇 응답)
  - 봇이 이전 대화 맥락을 인지하는지 연속 메시지로 확인
- [x] **TASK-11** 멀티턴 대화 컨텍스트 확인
  - "내 이름은 채니야" → "내 이름이 뭐라고 했지?" 연속 테스트 통과

---

## Phase 5: RAG 파이프라인 [크롤링/학습 에이전트] (Phase 4 완료 후)

- [x] **TASK-12** Supabase pgvector 테이블 스키마 설계 (`database/schema.sql`)
- [x] **TASK-13** `src/embedding/embedding.service.ts` — HF Inference API (paraphrase-multilingual-MiniLM-L12-v2, 384-dim)
- [x] **TASK-14** `src/retrieval/retrieval.service.ts` — pgvector similarity search (match_medicines RPC)
- [x] **TASK-15** `BotService.respond()` 에 RAG 컨텍스트 주입 (시스템 프롬프트 + 검색 결과)
- [x] **TASK-16** `src/ingestion/` — 공공데이터 API 수집 + 배치 임베딩 + Supabase upsert

---

## Phase 6: 웹 프론트 [클라이언트 에이전트] (Phase 4 완료 후 병행 가능)

- [x] **TASK-17** 프론트 프로젝트 초기 세팅 (Next.js 16 + Tailwind, `/chat-bot-web`)
- [x] **TASK-18** Socket.io 클라이언트 연결 + 채팅 UI (`useChat` 훅, `ChatWindow` 컴포넌트)
- [x] **TASK-19** 봇 응답 타이핑 인디케이터 UI (bounce 애니메이션)

---

## Phase 7: 배포 [백엔드 + 클라이언트 에이전트]

- [ ] **TASK-20** Railway 또는 Render에 백엔드 배포 설정 (Dockerfile 작성)
- [ ] **TASK-21** Vercel에 프론트 배포
- [ ] **TASK-22** 환경 변수 설정 및 E2E 연결 확인

---

## 현재 상태

**진행 중인 Phase**: Phase 7 (배포)
**마지막 완료 태스크**: TASK-16 (RAG 파이프라인 완성 + 전체 수집 실행 중)
**다음 실행할 태스크**: TASK-20 (배포)
