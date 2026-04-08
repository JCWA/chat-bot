import { Injectable } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { EmbeddingService } from '../embedding/embedding.service'

export interface MedicineResult {
  item_seq: string
  item_name: string
  drug_shape: string
  color_class1: string
  color_class2: string
  print_front: string
  print_back: string
  line_front: string
  line_back: string
  form_code_name: string
  entp_name: string
  chart: string
  similarity: number
}

@Injectable()
export class RetrievalService {
  private _supabase: SupabaseClient | null = null

  constructor(private readonly embeddingService: EmbeddingService) {}

  private get supabase(): SupabaseClient {
    if (!this._supabase) {
      const url = process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_KEY
      if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY 환경 변수가 설정되지 않았습니다.')
      this._supabase = createClient(url, key)
    }
    return this._supabase
  }

  async search(query: string, topK = 5): Promise<MedicineResult[]> {
    const embedding = await this.embeddingService.embed(query)

    const { data, error } = await this.supabase.rpc('match_medicines', {
      query_embedding: embedding,
      match_threshold: 0.4,
      match_count: topK,
    })

    if (error) {
      console.error('[RetrievalService] Supabase RPC error:', error)
      return []
    }

    return (data as MedicineResult[]) ?? []
  }

  /** 검색 결과를 LLM 프롬프트에 주입할 텍스트로 변환 */
  formatContext(results: MedicineResult[]): string {
    if (!results.length) return ''

    return results
      .map((m, i) => {
        const parts = [
          `[${i + 1}] ${m.item_name}`,
          m.entp_name && `제조사: ${m.entp_name}`,
          m.drug_shape && `모양: ${m.drug_shape}`,
          (m.color_class1 || m.color_class2) &&
            `색상: ${[m.color_class1, m.color_class2].filter(Boolean).join('/')}`,
          m.form_code_name && `제형: ${m.form_code_name}`,
          (m.print_front || m.print_back) &&
            `식별문자: 앞(${m.print_front ?? '-'}) 뒤(${m.print_back ?? '-'})`,
          (m.line_front || m.line_back) &&
            `분할선: 앞(${m.line_front ?? '-'}) 뒤(${m.line_back ?? '-'})`,
          m.chart && `성상: ${m.chart}`,
        ]
          .filter(Boolean)
          .join(', ')
        return parts
      })
      .join('\n')
  }
}
