# CONTEXT.md

## 프로젝트 목적

기존 프로덕션 챗 서버(`chat-server`)의 Socket.io 구조를 재사용해 **AI 챗봇 서버**를 새로 작성한다.
대화 내용은 저장하지 않는다. 서버 인메모리에 세션 컨텍스트(최근 N개 메시지)만 유지한다.

---

## 멀티 서브에이전트 구조

이 프로젝트는 역할별 서브에이전트가 나눠서 작업한다.

| 에이전트 | 담당 |
|---------|------|
| 기획 | 요구사항 정리, 봇 페르소나/프롬프트 설계 |
| 백엔드 | NestJS 서버 구현 (이 TASKS.md 범위) |
| 클라이언트 | Next.js + Socket.io 채팅 UI |
| QA | 소켓 연결/메시지 흐름 테스트 |
| 크롤링/학습 | 데이터 수집 → 청킹 → 임베딩 → RAG 파이프라인 |

---

## 기존 chat-server에서 재사용하는 것

경로: `/Users/channy/Documents/spaceoddity/chat-server`

| 파일 | 재사용 내용 |
|------|------------|
| `chat/chat.gateway.ts` | 네임스페이스 정규식, sendMessage/startTyping/endTyping 구조, CORS 설정 |
| `chat/model/redis.keys.ts` | 키 네이밍 패턴 참고 |
| `tsconfig.json`, `nest-cli.json` | 빌드 설정 |

## 기존 chat-server에서 제거하는 것

| 항목 | 이유 |
|------|------|
| TypeORM / MySQL / PostgreSQL | 불필요 |
| 세션 기반 auth | 쿼리 파라미터 `userId`로 대체 |
| ProfileService | 불필요 |
| NotificationService | 불필요 |
| ArtistUnitService | 불필요 |
| RedisIoAdapter | 단일 인스턴스, Redis 어댑터 불필요 |
| RedisCacheManager | 불필요 |
| 블록 필터 / unread count | 불필요 |
| readMessage 이벤트 | 불필요 |
| chatListUpdate 이벤트 | 불필요 |

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 런타임 | Node.js 20+ |
| 프레임워크 | NestJS + TypeScript strict |
| WebSocket | Socket.io (chat-server와 동일 버전) |
| LLM | Groq API — `llama-3.3-70b-versatile` |
| 대화 컨텍스트 | 서버 인메모리 Map (저장 없음) |
| 인증 | 없음 (쿼리 파라미터 `userId`) |

---

## 디렉토리 구조

```
src/
  main.ts
  app.module.ts
  chat/
    chat.gateway.ts    # sendMessage 수신 → 봇 트리거, receiveMessage emit
    chat.module.ts
  bot/
    bot.service.ts     # 인메모리 컨텍스트 관리 + Groq API 호출
    bot.module.ts
```

---

## 봇 메시지 플로우

```
클라이언트
  └─ emit('sendMessage', { message, chatId })
        ↓
ChatGateway.handleSendMessage()
  ├─ emit('receiveMessage', { userId, message })  ← 유저 메시지 브로드캐스트
  └─ BotService.respond(chatId, message)
        ├─ 인메모리 Map에서 chatId 대화 컨텍스트 로드 (최근 20개)
        ├─ Groq API 호출 (llama-3.3-70b-versatile)
        ├─ 인메모리 Map에 봇 응답 추가
        └─ 응답 string 반환
              ↓
        ChatGateway → emit('receiveMessage', { userId: 'bot', message: botReply })
```

---

## 인메모리 컨텍스트 구조

```typescript
// BotService 내부
private conversations = new Map<string, { role: 'user' | 'assistant'; content: string }[]>()
// key: chatId (string)
// 최대 20개 유지, 초과 시 앞에서 제거 (FIFO)
// 서버 재시작 시 초기화됨 — 의도된 동작
```

---

## 환경 변수 (.env)

```
PORT=3000
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
BOT_CONTEXT_LIMIT=20
BOT_USER_ID=bot
```

---

## 무료 인프라

| 항목 | 서비스 |
|------|-------|
| 서버 배포 | Railway (무료 $5 크레딧/월) 또는 Render (free tier) |
| LLM | Groq API (무료 티어) |
| 벡터 DB (RAG Phase) | Supabase pgvector (무료 티어) |
| 임베딩 (RAG Phase) | Hugging Face Inference API (무료 티어) |
| 프론트 배포 | Vercel (무료) |

---

## 개발 원칙

- **대화 비저장**: 인메모리 컨텍스트만 유지. Redis 불필요.
- **최소 의존성**: NestJS, Socket.io, @nestjs/websockets 만 핵심 의존성
- **chat-server 참고만**: 코드 직접 복사 금지, 구조 참고용
- **점진적 확장**: 봇 동작 확인 → RAG 파이프라인 → 웹 프론트 순서
