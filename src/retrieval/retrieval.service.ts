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
  similarity?: number
}

// 사용자 쿼리에서 약 특징 키워드 추출
const COLOR_MAP: Record<string, string> = {
  흰색: '하양', 하얀: '하양', 하양: '하양', 백색: '하양',
  빨간: '빨강', 빨강: '빨강', 적색: '빨강',
  노란: '노랑', 노랑: '노랑', 황색: '노랑',
  파란: '파랑', 파랑: '파랑', 청색: '파랑',
  초록: '초록', 녹색: '초록', 초록색: '초록',
  연두: '연두', 연두색: '연두',
  주황: '주황', 오렌지: '주황',
  보라: '보라', 자주: '자주', 분홍: '분홍',
  갈색: '갈색', 검정: '검정', 회색: '회색',
}
const SHAPE_MAP: Record<string, string> = {
  원형: '원형', 둥근: '원형', 동그란: '원형', 동그랗: '원형',
  타원: '타원형', 타원형: '타원형', 계란형: '타원형',
  장방형: '장방형', 직사각: '장방형', 긴: '장방형',
  삼각: '삼각형', 삼각형: '삼각형',
  사각: '사각형', 사각형: '사각형', 네모: '사각형',
  오각: '오각형', 육각: '육각형', 팔각: '팔각형',
  기타: '기타',
}

function extractKeywords(query: string): { colors: string[]; shapes: string[]; prints: string[] } {
  const q = query.toLowerCase()
  const colors = Object.entries(COLOR_MAP)
    .filter(([k]) => q.includes(k))
    .map(([, v]) => v)
    .filter((v, i, a) => a.indexOf(v) === i)

  const shapes = Object.entries(SHAPE_MAP)
    .filter(([k]) => q.includes(k))
    .map(([, v]) => v)
    .filter((v, i, a) => a.indexOf(v) === i)

  // 영문/숫자 식별문자 추출 (2자 이상 대문자 or 숫자 조합)
  const prints = (query.match(/[A-Z0-9]{2,}/g) ?? [])
    .filter((p) => p !== 'IDG' ? true : true) // 전부 허용

  return { colors, shapes, prints }
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

  /** 하이브리드 검색: 키워드 필터 우선, 시맨틱 보완 */
  async search(query: string, topK = 5): Promise<MedicineResult[]> {
    const { colors, shapes, prints } = extractKeywords(query)

    // 1) 약 이름 직접 검색
    const nameResults = await this.nameSearch(query, topK)

    // 2) 키워드 필터 검색 (색상/모양/식별문자)
    const keywordResults = await this.keywordSearch(colors, shapes, prints, topK)

    // 3) 시맨틱 검색
    const semanticResults = await this.semanticSearch(query, topK)

    // 4) 합치기: 이름 검색 > 키워드 > 시맨틱 (중복 제거)
    const seen = new Set<string>()
    const merged: MedicineResult[] = []

    for (const m of [...nameResults, ...keywordResults, ...semanticResults]) {
      if (!seen.has(m.item_seq)) {
        seen.add(m.item_seq)
        merged.push(m)
      }
      if (merged.length >= topK) break
    }

    return merged
  }

  /** 약 이름으로 직접 검색 */
  private async nameSearch(query: string, topK: number): Promise<MedicineResult[]> {
    // 한글 2자 이상 연속 단어 추출
    const nameTokens = query.match(/[가-힣]{2,}/g) ?? []
    if (!nameTokens.length) return []

    const orFilter = nameTokens.map((t) => `item_name.ilike.%${t}%`).join(',')
    const { data, error } = await this.supabase
      .from('medicines')
      .select('item_seq,item_name,drug_shape,color_class1,color_class2,print_front,print_back,line_front,line_back,form_code_name,entp_name,chart')
      .or(orFilter)
      .limit(topK)

    if (error) return []
    return (data as MedicineResult[]) ?? []
  }

  private async keywordSearch(
    colors: string[],
    shapes: string[],
    prints: string[],
    topK: number,
  ): Promise<MedicineResult[]> {
    if (!colors.length && !shapes.length && !prints.length) return []

    let q = this.supabase
      .from('medicines')
      .select('item_seq,item_name,drug_shape,color_class1,color_class2,print_front,print_back,line_front,line_back,form_code_name,entp_name,chart')
      .limit(topK)

    if (prints.length) {
      const printFilter = prints.map((p) => `print_front.ilike.%${p}%,print_back.ilike.%${p}%`).join(',')
      q = q.or(printFilter)
    }
    if (colors.length) {
      q = q.or(colors.map((c) => `color_class1.ilike.%${c}%,color_class2.ilike.%${c}%`).join(','))
    }
    if (shapes.length) {
      q = q.or(shapes.map((s) => `drug_shape.ilike.%${s}%`).join(','))
    }

    const { data, error } = await q
    if (error) {
      console.error('[RetrievalService] keyword search error:', error.message)
      return []
    }
    return (data as MedicineResult[]) ?? []
  }

  private async semanticSearch(query: string, topK: number): Promise<MedicineResult[]> {
    try {
      const embedding = await this.embeddingService.embed(query)
      const { data, error } = await this.supabase.rpc('match_medicines', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: topK,
      })
      if (error) return []
      return (data as MedicineResult[]) ?? []
    } catch {
      return []
    }
  }

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
