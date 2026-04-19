import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Medicine } from '../medicine/medicine.entity'
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

// SELECT 절에 쓸 공통 컬럼
const SELECT_COLS =
  'item_seq, item_name, drug_shape, color_class1, color_class2, print_front, print_back, line_front, line_back, form_code_name, entp_name, chart, class_name, item_image, efcy, use_method, side_effect'

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

  const prints = (query.toUpperCase().match(/[A-Z0-9]+/g) ?? [])

  return { colors, shapes, prints }
}

@Injectable()
export class RetrievalService {
  private readonly searchCache = new Map<string, { results: MedicineResult[]; expires: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5분

  constructor(
    @InjectRepository(Medicine)
    private readonly repo: Repository<Medicine>,
    private readonly embeddingService: EmbeddingService,
  ) {
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000)
  }

  private cleanupCache() {
    const now = Date.now()
    for (const [key, value] of this.searchCache) {
      if (value.expires <= now) this.searchCache.delete(key)
    }
  }

  /** 하이브리드 검색: 우선순위별 단계적 검색, 상위 단계 결과가 있으면 하위 단계는 섞지 않음 */
  async search(query: string, topK = 3): Promise<MedicineResult[]> {
    const cacheKey = `${query}:${topK}`
    const cached = this.searchCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) return cached.results

    const { colors, shapes, prints } = extractKeywords(query)
    const hasAppearanceQuery = colors.length > 0 || shapes.length > 0 || prints.length > 0

    // nameSearch → 전체 쿼리 literal 이 item_name 에 포함된 "exact" 결과가 하나라도 있으면 이미 신호 강함.
    // 머지 없이 name 만 반환. (써스펜 8시간 → '써스펜8시간' literal 매치 → trust)
    // exact 매치 없는데(shrink 로 brand family 잡음) topK 미만이면 classSearch 머지로 카테고리 보완.
    // (알레르기 약 → '알레르기약' literal 아니라 '알레르' 로 shrink → 알레르텍 + 항히스타민 merge)
    const fullQuery = query.replace(/[^가-힣a-zA-Z0-9\-]/g, '').trim()
    const nameResults = await this.nameSearch(query, topK)
    const hasExactNameHit = fullQuery.length >= 2 && nameResults.some((r) => {
      const n = (r as unknown as { item_name?: string }).item_name ?? ''
      return n.includes(fullQuery)
    })
    if (hasExactNameHit || nameResults.length >= topK) {
      return this.cacheAndReturn(cacheKey, nameResults.slice(0, topK))
    }

    if (hasAppearanceQuery) {
      const keywordResults = await this.keywordSearch(colors, shapes, prints, topK)
      if (keywordResults.length > 0) return this.cacheAndReturn(cacheKey, keywordResults.slice(0, topK))
    }

    const classResults = await this.classSearch(query, topK)
    if (nameResults.length > 0 || classResults.length > 0) {
      const seen = new Set<string>(nameResults.map((r) => (r as unknown as { item_seq: string }).item_seq))
      const extra = classResults.filter((r) => !seen.has((r as unknown as { item_seq: string }).item_seq))
      const merged = [...nameResults, ...extra].slice(0, topK)
      return this.cacheAndReturn(cacheKey, merged)
    }

    const semanticResults = await this.semanticSearch(query, topK)
    return this.cacheAndReturn(cacheKey, semanticResults.slice(0, topK))
  }

  private cacheAndReturn(key: string, results: MedicineResult[]): MedicineResult[] {
    this.searchCache.set(key, { results, expires: Date.now() + this.CACHE_TTL })
    return results
  }

  private static readonly STOP_PATTERNS = [
    /찾아[보봐줘주]?\S*/g,
    /알려[줘주봐]?\S*/g,
    /검색\S*/g,
    /보여[줘주]?\S*/g,
    /알고\s?싶\S*/g,
    /궁금\S*/g,
    /어떤\S*/g,
    /무슨\S*/g,
    /어떻게\S*/g,
    /뭐[야에예]?\S*/g,
    /인가[요]?\S*/g,
    /있[어나는을]?\S*/g,
    /없[어나는을]?\S*/g,
    /해[줘주봐]\S*/g,
    /\s좀\s/g,
  ]

  private cleanQuery(query: string): string {
    let cleaned = query
    for (const pattern of RetrievalService.STOP_PATTERNS) {
      cleaned = cleaned.replace(pattern, '')
    }
    return cleaned.replace(/\s+/g, ' ').trim()
  }

  /** 약 이름으로 직접 검색 — 전체 쿼리로 먼저 검색, 0 매치면 뒤에서부터 한 자씩 줄여 재시도, 여전히 실패 시 토큰으로 */
  private async nameSearch(query: string, topK: number): Promise<MedicineResult[]> {
    const cleaned = this.cleanQuery(query)

    const fullQuery = cleaned.replace(/[^가-힣a-zA-Z0-9\-]/g, '').trim()
    if (fullQuery.length >= 2) {
      // 예) '판콜에스' (DB 에 '판콜에이', '판콜비타' 만 있음) → '판콜에' 0 → '판콜' 2건 매치.
      // 공통 접두어가 상품명 패밀리를 잡아주므로 semantic fallback(외관 기반) 으로 가기 전 한 번 더 시도.
      const minLen = Math.max(2, Math.floor(fullQuery.length / 2))
      for (let len = fullQuery.length; len >= minLen; len--) {
        const substr = fullQuery.slice(0, len)
        const rows = await this.repo
          .createQueryBuilder('m')
          .select(SELECT_COLS.split(',').map((c) => `m.${c.trim()}`))
          .where('m.item_name ILIKE :q', { q: `%${substr}%` })
          .limit(topK)
          .getMany()
        if (rows.length > 0) return rows as unknown as MedicineResult[]
      }
    }

    const nameTokens = cleaned.match(/[가-힣]{4,}/g) ?? []
    if (!nameTokens.length) return []

    const qb = this.repo.createQueryBuilder('m').select(SELECT_COLS.split(',').map((c) => `m.${c.trim()}`))
    const conds = nameTokens.map((_, i) => `m.item_name ILIKE :t${i}`)
    const params: Record<string, string> = {}
    nameTokens.forEach((t, i) => (params[`t${i}`] = `%${t}%`))
    try {
      const rows = await qb.where(`(${conds.join(' OR ')})`, params).limit(topK).getMany()
      return rows as unknown as MedicineResult[]
    } catch (err) {
      console.error('[RetrievalService] nameSearch token fallback 실패:', (err as Error).message)
      return []
    }
  }

  /** 약효분류 + 효능 검색 */
  private async classSearch(query: string, topK: number): Promise<MedicineResult[]> {
    const cleaned = this.cleanQuery(query)
    const rawTokens = cleaned.match(/[가-힣]{2,}/g) ?? []
    const excluded = new Set([...Object.keys(COLOR_MAP), ...Object.keys(SHAPE_MAP)])
    // class_name/efcy 는 서술형 본문이라 사용자 입력 어미가 그대로 안 붙음.
    // 3자+ 토큰은 뒤 한 자 떼어낸 substring 도 함께 검색해 접미어(약/제/류/...)까지 흡수.
    // 예) '감기약' → {감기약, 감기}, '수면제' → {수면제, 수면}.
    const expanded = rawTokens.flatMap((t) => (t.length >= 3 ? [t, t.slice(0, -1)] : [t]))
    const filtered = [...new Set(expanded)].filter((t) => !excluded.has(t) && t.length >= 2)
    if (!filtered.length) return []

    const qb = this.repo.createQueryBuilder('m').select(SELECT_COLS.split(',').map((c) => `m.${c.trim()}`))
    const conds: string[] = []
    const params: Record<string, string> = {}
    filtered.forEach((t, i) => {
      conds.push(`m.class_name ILIKE :c${i}`, `m.efcy ILIKE :e${i}`)
      params[`c${i}`] = `%${t}%`
      params[`e${i}`] = `%${t}%`
    })
    try {
      const rows = await qb.where(`(${conds.join(' OR ')})`, params).limit(topK).getMany()
      return rows as unknown as MedicineResult[]
    } catch (err) {
      console.error('[RetrievalService] classSearch 실패:', (err as Error).message)
      return []
    }
  }

  /** 키워드 검색 — search_by_appearance 함수 호출 */
  private async keywordSearch(
    colors: string[],
    shapes: string[],
    prints: string[],
    topK: number,
  ): Promise<MedicineResult[]> {
    if (!colors.length && !shapes.length && !prints.length) return []

    try {
      const rows = await this.repo.manager.query(
        'SELECT * FROM search_by_appearance($1, $2, $3, $4)',
        [
          colors.length > 0 ? colors : null,
          shapes.length > 0 ? shapes : null,
          prints.length > 0 ? prints : null,
          topK,
        ],
      )
      return rows as MedicineResult[]
    } catch (err) {
      console.error('[RetrievalService] keyword search error:', (err as Error).message)
      return []
    }
  }

  private async semanticSearch(query: string, topK: number): Promise<MedicineResult[]> {
    try {
      const embedding = await this.embeddingService.embed(query)
      const vecLit = '[' + embedding.map((x) => x.toFixed(7)).join(',') + ']'
      const rows = await this.repo.manager.query(
        'SELECT * FROM match_medicines($1::vector, $2, $3)',
        [vecLit, 0.5, topK],
      )
      return rows as MedicineResult[]
    } catch (err) {
      console.error('[RetrievalService] semanticSearch 실패:', (err as Error).message)
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
          m.efcy && `효능: ${m.efcy.slice(0, 100)}`,
          m.use_method && `용법: ${m.use_method.slice(0, 80)}`,
          m.side_effect && `부작용: ${m.side_effect.slice(0, 80)}`,
        ]
          .filter(Boolean)
          .join(', ')
        return parts
      })
      .join('\n')
  }
}
