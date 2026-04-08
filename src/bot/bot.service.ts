import { Injectable, Optional } from '@nestjs/common'
import { RetrievalService } from '../retrieval/retrieval.service'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `당신은 의약품 식별 전문 챗봇입니다.
사용자가 약의 모양, 색상, 제형, 분할선, 식별문자를 설명하면 해당 약을 찾아 안내합니다.
아래 [참고 의약품 정보]가 제공되면 이를 바탕으로 정확하게 답변하세요.
정보가 없으면 "해당 조건에 맞는 약을 찾지 못했습니다"라고 안내하세요.
복약 지도나 처방 관련 조언은 반드시 전문가 상담을 권유하세요.`

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
        body: JSON.stringify({ model: this.model, messages }),
      })

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[]
      }
      const botReply = data.choices[0]?.message?.content ?? '응답을 생성할 수 없습니다.'

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

  private trimHistory(chatId: string, history: Message[]) {
    if (history.length > this.contextLimit) {
      history.splice(0, history.length - this.contextLimit)
    }
    this.conversations.set(chatId, history)
  }
}
