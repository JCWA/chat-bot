# CONTEXT.md

## 프로젝트 목적

AI 의약품 식별 챗봇 서버. 사용자가 약의 외관(모양·색상·식별문자)이나 약 이름·약효분류·효능을 입력하면 RAG 파이프라인으로 해당 약을 찾아 안내한다.

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 런타임 | Node.js 20+ |
| 프레임워크 | NestJS + TypeScript strict |
| WebSocket | Socket.io |
| LLM | Groq API — `llama-3.3-70b-versatile` (temperature 0.3) |
| 임베딩 | HuggingFace Inference API (`paraphrase-multilingual-MiniLM-L12-v2`, 384-dim) |
| 벡터 DB | Supabase pgvector |
| 데이터 소스 | 공공데이터포털 — 낱알식별 API + e약은요 API |
| 대화 컨텍스트 | 서버 인메모리 Map (저장 없음) |
| 인증 | 없음 (쿼리 파라미터 `userId`) |

---

## 디렉토리 구조

```
src/
  main.ts
  app.module.ts
  chat/
    chat.gateway.ts      # WebSocket: sendMessage → 봇 응답 + 약 카드 emit
    chat.module.ts
  bot/
    bot.service.ts       # Groq LLM 호출, RAG 컨텍스트 주입, BotResponse 반환
    bot.module.ts
  retrieval/
    retrieval.service.ts # 하이브리드 검색 (이름/약효/키워드AND/시맨틱)
    retrieval.module.ts
  embedding/
    embedding.service.ts # HF Inference API 임베딩 (단건/배치)
    embedding.module.ts
  ingestion/
    ingestion.service.ts # 공공데이터 수집 + 임베딩 + e약은요 효능 수집
    ingestion.controller.ts # POST /ingestion/run, POST /ingestion/drug-info
    ingestion.module.ts
database/
  schema.sql             # medicines 테이블, match_medicines RPC, search_by_appearance RPC
  migration_add_drug_info.sql # e약은요 컬럼 추가 마이그레이션
```

---

## 봇 메시지 플로우

```
클라이언트
  └─ emit('sendMessage', { message })
        ↓
ChatGateway.handleSendMessage()
  ├─ emit('receiveMessage', { userId, message })        ← 유저 메시지 브로드캐스트
  └─ BotService.respond(chatId, message)
        ├─ RetrievalService.search(message)             ← 하이브리드 검색
        │    ├─ nameSearch()                            ← 약 이름 검색
        │    ├─ keywordSearch() via search_by_appearance RPC ← 색상+모양+식별문자 AND
        │    ├─ classSearch()                           ← 약효분류 + 효능(efcy) 검색
        │    └─ semanticSearch() via match_medicines RPC ← 벡터 유사도 (보완용)
        ├─ formatContext(results) → 시스템 프롬프트에 주입
        ├─ Groq API 호출 (llama-3.3-70b-versatile, temp=0.3)
        ├─ sanitizeResponse() → 한자/일본어/베트남어 제거
        └─ { message: botReply, medicines: MedicineCard[] } 반환
              ↓
        ChatGateway → emit('receiveMessage', { userId: 'bot', message, medicines })
```

---

## 데이터 수집 파이프라인

| 단계 | API | 엔드포인트 |
|------|-----|-----------|
| 외관 데이터 수집 + 임베딩 | MdcinGrnIdntfcInfoService03 | `POST /ingestion/run` |
| 효능/부작용 수집 (e약은요) | DrbEasyDrugInfoService | `POST /ingestion/drug-info` |

- 외관 수집: 이미 임베딩된 항목 자동 스킵 (resume 지원)
- e약은요: efcy가 NULL인 항목만 처리 (resume 지원)

---

## 환경 변수 (.env)

```
PORT=3000
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
BOT_CONTEXT_LIMIT=20
BOT_USER_ID=bot
HF_API_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
DATA_GO_KR_API_KEY=
```

---

## 프론트엔드 (chat-bot-web)

| 항목 | 선택 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 스타일 | Tailwind CSS 4 |
| 실시간 통신 | Socket.io-client |
| 배포 | Vercel |

### 주요 기능
- 약 카드 UI (이미지 + 이름 + 제조사 + 약효분류 + 효능) — 가로 스크롤
- 카드 클릭 시 해당 약 상세 검색
- 초기 화면 사용법 안내 + 예시 질문 버튼
- SEO: 메타태그, OG, robots.txt, sitemap.xml
- 반응형: 모바일/데스크탑 breakpoint 분리
- 시맨틱 HTML: header, main, footer, article

---

## 무료 인프라

| 항목 | 서비스 |
|------|-------|
| 백엔드 배포 | Railway |
| LLM | Groq API (무료 티어 — 분당 30요청) |
| 벡터 DB | Supabase pgvector (무료 티어) |
| 임베딩 | HuggingFace Inference API (무료 티어) |
| 프론트 배포 | Vercel |
