import { Injectable, Optional } from '@nestjs/common'
import { MedicineResult, RetrievalService } from '../retrieval/retrieval.service'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface BotResponse {
  message: string
  medicines: MedicineCard[]
}

export interface MedicineCard {
  item_name: string
  entp_name: string
  item_image: string | null
  drug_shape: string | null
  color: string | null
  class_name: string | null
  efcy: string | null
}

const SYSTEM_PROMPT = `당신은 약의 외관(모양·색상·제형·분할선·식별문자)으로 약을 찾아주는 의약품 식별 챗봇입니다.

[규칙 — 반드시 준수]
1. 오직 아래 [참고 의약품 정보]에 있는 내용만 답변하세요. 데이터에 없는 내용은 절대 지어내지 마세요. 존재하지 않는 약 이름을 만들어내지 마세요.
2. 답변 가능한 것: 약 이름, 제조사, 모양, 색상, 제형, 식별문자, 분할선, 성상, 약효분류, 효능/효과, 용법/용량, 부작용.
3. [참고 의약품 정보]에 효능·용법·부작용이 포함되어 있으면 해당 내용을 안내하세요. 정보가 없는 항목은 "해당 정보가 없습니다. 약사 또는 의사에게 문의하세요."라고 답하세요.
4. [참고 의약품 정보]가 없거나 조건에 맞는 약이 없으면 "해당 조건에 맞는 약을 찾지 못했습니다. 모양·색상·식별문자를 더 자세히 알려주시면 다시 찾아보겠습니다."라고 답하세요.
5. 반드시 한국어(한글)로만 답변하세요. 한자(漢字), 일본어, 중국어, 베트남어 등 다른 문자를 절대 섞지 마세요. 영어는 약 이름·식별문자 등 고유명사에만 허용합니다.
6. 검색된 약이 여러 개면 각각 간략히 소개하세요. 이미지는 별도로 표시되므로 이미지 URL을 답변에 포함하지 마세요.`

@Injectable()
export class BotService {
  private readonly conversations = new Map<string, { messages: Message[]; lastAccess: number }>()
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions'
  private readonly MAX_MESSAGE_LENGTH = 500
  private readonly CONVERSATION_TTL = 30 * 60 * 1000 // 30분

  constructor(
    @Optional() private readonly retrievalService?: RetrievalService,
  ) {
    // 5분마다 만료된 대화 정리
    setInterval(() => this.cleanupExpiredConversations(), 5 * 60 * 1000)
  }

  private cleanupExpiredConversations() {
    const now = Date.now()
    for (const [chatId, conv] of this.conversations) {
      if (now - conv.lastAccess > this.CONVERSATION_TTL) {
        this.conversations.delete(chatId)
      }
    }
  }

  private get model(): string {
    return process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant'
  }

  private get contextLimit(): number {
    return parseInt(process.env.BOT_CONTEXT_LIMIT ?? '4', 10)
  }

  async respond(chatId: string, userMessage: string): Promise<BotResponse> {
    const trimmedMessage = userMessage.slice(0, this.MAX_MESSAGE_LENGTH)
    const history = this.getHistory(chatId)

    // RAG: 사용자 메시지로 관련 약 검색
    let systemContent = SYSTEM_PROMPT
    let searchResults: MedicineResult[] = []
    if (this.retrievalService) {
      try {
        searchResults = await this.retrievalService.search(trimmedMessage)
        if (searchResults.length > 0) {
          const context = this.retrievalService.formatContext(searchResults)
          systemContent = `${SYSTEM_PROMPT}\n\n[참고 의약품 정보]\n${context}`
        }
      } catch (err) {
        console.error('[BotService] RAG 검색 실패:', err)
      }
    }

    const messages: Message[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: trimmedMessage },
    ]

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(this.groqApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model: this.model, messages, temperature: 0.3 }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('RATE_LIMIT')
        }
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[]
      }
      const rawReply = data.choices[0]?.message?.content ?? '응답을 생성할 수 없습니다.'
      const botReply = this.sanitizeResponse(rawReply)

      history.push({ role: 'user', content: trimmedMessage })
      history.push({ role: 'assistant', content: botReply })
      this.trimHistory(chatId, history)

      // LLM이 "찾지 못했습니다" 류 응답이면 카드 표시 안 함
      const notFound = botReply.includes('찾지 못했') || botReply.includes('찾을 수 없') || botReply.includes('해당 조건에 맞는 약')
      const medicines: MedicineCard[] = notFound ? [] : searchResults.map((m) => ({
        item_name: m.item_name,
        entp_name: m.entp_name,
        item_image: m.item_image ?? null,
        drug_shape: m.drug_shape ?? null,
        color: [m.color_class1, m.color_class2].filter(Boolean).join('/') || null,
        class_name: m.class_name ?? null,
        efcy: m.efcy ?? null,
      }))

      return { message: botReply, medicines }
    } catch (error) {
      console.error(`[BotService] Groq API 호출 실패:`, error)
      throw error
    }
  }

  private getHistory(chatId: string): Message[] {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, { messages: [], lastAccess: Date.now() })
    }
    const conv = this.conversations.get(chatId)!
    conv.lastAccess = Date.now()
    return conv.messages
  }

  /** 한자·일본어·중국어·베트남어 등 비한글 문자를 한글로 대체 */
  private sanitizeResponse(text: string): string {
    // CJK Unified Ideographs (한자)
    // Hiragana, Katakana (일본어)
    // CJK Compatibility Ideographs
    // Vietnamese combining marks that appear in corrupted output
    return text
      .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, '')
      .replace(/[\u3040-\u309F\u30A0-\u30FF]/g, '')
      .replace(/[\u0300-\u036F\u1EA0-\u1EF9]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  private trimHistory(chatId: string, history: Message[]) {
    if (history.length > this.contextLimit) {
      history.splice(0, history.length - this.contextLimit)
    }
    this.conversations.set(chatId, { messages: history, lastAccess: Date.now() })
  }
}
