import { Injectable, Optional } from '@nestjs/common'
import { RetrievalService } from '../retrieval/retrieval.service'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `당신은 약의 외관(모양·색상·제형·분할선·식별문자)으로 약을 찾아주는 의약품 식별 챗봇입니다.

[규칙 — 반드시 준수]
1. 오직 아래 [참고 의약품 정보]에 있는 내용만 답변하세요. 데이터에 없는 내용은 절대 지어내지 마세요. 존재하지 않는 약 이름을 만들어내지 마세요.
2. 답변 가능한 것: 약 이름, 제조사, 모양, 색상, 제형, 식별문자, 분할선, 성상(chart), 약효분류.
3. 답변 불가능한 것: 구체적 효능, 부작용, 성분, 적응증, 복용법, 용량. 이런 질문엔 "이 챗봇은 의약품 식별 전용입니다. 구체적 효능·용법은 약사 또는 의사에게 문의하세요."라고만 답하세요. 단, 약효분류(예: 해열진통소염제, 항생물질제제)는 안내 가능합니다.
4. [참고 의약품 정보]가 없거나 조건에 맞는 약이 없으면 "해당 조건에 맞는 약을 찾지 못했습니다. 모양·색상·식별문자를 더 자세히 알려주시면 다시 찾아보겠습니다."라고 답하세요.
5. 반드시 한국어(한글)로만 답변하세요. 한자(漢字), 일본어, 중국어, 베트남어 등 다른 문자를 절대 섞지 마세요. 영어는 약 이름·식별문자 등 고유명사에만 허용합니다.`

@Injectable()
export class BotService {
  private readonly conversations = new Map<string, Message[]>()
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions'

  constructor(
    @Optional() private readonly retrievalService?: RetrievalService,
  ) {}

  private get model(): string {
    return process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
  }

  private get contextLimit(): number {
    return parseInt(process.env.BOT_CONTEXT_LIMIT ?? '20', 10)
  }

  async respond(chatId: string, userMessage: string): Promise<string> {
    const history = this.getHistory(chatId)

    // RAG: 사용자 메시지로 관련 약 검색
    let systemContent = SYSTEM_PROMPT
    if (this.retrievalService) {
      try {
        const results = await this.retrievalService.search(userMessage)
        if (results.length > 0) {
          const context = this.retrievalService.formatContext(results)
          systemContent = `${SYSTEM_PROMPT}\n\n[참고 의약품 정보]\n${context}`
        }
      } catch (err) {
        console.error('[BotService] RAG 검색 실패:', err)
      }
    }

    const messages: Message[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: userMessage },
    ]

    try {
      const response = await fetch(this.groqApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model: this.model, messages, temperature: 0.3 }),
      })

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[]
      }
      const rawReply = data.choices[0]?.message?.content ?? '응답을 생성할 수 없습니다.'
      const botReply = this.sanitizeResponse(rawReply)

      history.push({ role: 'user', content: userMessage })
      history.push({ role: 'assistant', content: botReply })
      this.trimHistory(chatId, history)

      return botReply
    } catch (error) {
      console.error(`[BotService] Groq API 호출 실패:`, error)
      throw error
    }
  }

  private getHistory(chatId: string): Message[] {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, [])
    }
    return this.conversations.get(chatId)
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
    this.conversations.set(chatId, history)
  }
}
