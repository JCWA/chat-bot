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
  class_name?: string
  item_image?: string
  efcy?: string
  use_method?: string
  side_effect?: string
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

  // 영문/숫자 식별문자 추출 (1자 이상 대문자 or 숫자 조합)
  const prints = (query.toUpperCase().match(/[A-Z0-9]+/g) ?? [])

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

  /** 하이브리드 검색: 키워드 AND 필터 우선, 시맨틱은 보완용 */
  async search(query: string, topK = 5): Promise<MedicineResult[]> {
    const { colors, shapes, prints } = extractKeywords(query)
    const hasAppearanceQuery = colors.length > 0 || shapes.length > 0 || prints.length > 0

    // 1) 약 이름 직접 검색
    const nameResults = await this.nameSearch(query, topK)

    // 이름으로 충분히 찾았으면 바로 반환
    if (nameResults.length >= topK) return nameResults.slice(0, topK)

    // 2) 외관 키워드가 있으면 키워드 AND 검색
    const keywordResults = hasAppearanceQuery
      ? await this.keywordSearch(colors, shapes, prints, topK)
      : []

    // 3) 약효분류 검색
    const classResults = await this.classSearch(query, topK)

    // 4) 시맨틱 검색 — 외관 키워드가 없거나 결과 부족 시 실행 (동의어 매칭용)
    const foundSoFar = nameResults.length + keywordResults.length + classResults.length
    const semanticResults = (!hasAppearanceQuery || foundSoFar < topK)
      ? await this.semanticSearch(query, topK)
      : []

    // 5) 합치기: 이름 > 키워드(AND) > 약효분류 > 시맨틱 (중복 제거)
    const seen = new Set<string>()
    const merged: MedicineResult[] = []

    for (const m of [...nameResults, ...keywordResults, ...classResults, ...semanticResults]) {
      if (!seen.has(m.item_seq)) {
        seen.add(m.item_seq)
        merged.push(m)
      }
      if (merged.length >= topK) break
    }

    return merged
  }

  /** 약 이름으로 직접 검색 — 전체 쿼리로 먼저 검색, 없으면 3자 이상 토큰으로 검색 */
  private async nameSearch(query: string, topK: number): Promise<MedicineResult[]> {
    const select = 'item_seq,item_name,drug_shape,color_class1,color_class2,print_front,print_back,line_front,line_back,form_code_name,entp_name,chart,class_name,item_image,efcy,use_method,side_effect'

    // 1) 전체 쿼리 문자열로 정확 검색
    const fullQuery = query.replace(/[^가-힣a-zA-Z0-9]/g, '').trim()
    if (fullQuery.length >= 2) {
      const { data } = await this.supabase
        .from('medicines')
        .select(select)
        .ilike('item_name', `%${fullQuery}%`)
        .limit(topK)

      if (data && data.length > 0) return data as MedicineResult[]
    }

    // 2) 3자 이상 토큰으로 부분 검색 (짧은 토큰은 오매칭 방지)
    const nameTokens = (query.match(/[가-힣]{3,}/g) ?? [])
    if (!nameTokens.length) return []

    const orFilter = nameTokens.map((t) => `item_name.ilike.%${t}%`).join(',')
    const { data, error } = await this.supabase
      .from('medicines')
      .select(select)
      .or(orFilter)
      .limit(topK)

    if (error) return []
    return (data as MedicineResult[]) ?? []
  }

  /** 약효분류 + 효능 검색 (예: "진통제", "수면", "소화제") — 3자 이상 토큰만 */
  private async classSearch(query: string, topK: number): Promise<MedicineResult[]> {
    const tokens = query.match(/[가-힣]{2,}/g) ?? []
    // 색상/모양 키워드 제외
    const excluded = new Set([...Object.keys(COLOR_MAP), ...Object.keys(SHAPE_MAP)])
    const filtered = tokens.filter((t) => !excluded.has(t) && t.length >= 2)
    if (!filtered.length) return []

    const select = 'item_seq,item_name,drug_shape,color_class1,color_class2,print_front,print_back,line_front,line_back,form_code_name,entp_name,chart,class_name,item_image,efcy,use_method,side_effect'

    // class_name과 efcy 모두 검색
    const orFilter = filtered.flatMap((t) => [
      `class_name.ilike.%${t}%`,
      `efcy.ilike.%${t}%`,
    ]).join(',')

    const { data, error } = await this.supabase
      .from('medicines')
      .select(select)
      .or(orFilter)
      .limit(topK)

    if (error) return []
    return (data as MedicineResult[]) ?? []
  }

  /** 키워드 검색 — RPC로 정확한 AND 필터링 */
  private async keywordSearch(
    colors: string[],
    shapes: string[],
    prints: string[],
    topK: number,
  ): Promise<MedicineResult[]> {
    if (!colors.length && !shapes.length && !prints.length) return []

    const { data, error } = await this.supabase.rpc('search_by_appearance', {
      p_colors: colors.length > 0 ? colors : null,
      p_shapes: shapes.length > 0 ? shapes : null,
      p_prints: prints.length > 0 ? prints : null,
      p_limit: topK,
    })

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
        match_threshold: 0.5,
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
          m.class_name && `약효분류: ${m.class_name}`,
          m.efcy && `효능: ${m.efcy}`,
          m.use_method && `용법: ${m.use_method}`,
          m.side_effect && `부작용: ${m.side_effect}`,
          m.chart && `성상: ${m.chart}`,
          m.item_image && `이미지: ${m.item_image}`,
        ]
          .filter(Boolean)
          .join(', ')
        return parts
      })
      .join('\n')
  }
}
