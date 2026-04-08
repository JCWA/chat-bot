import { Injectable } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { EmbeddingService } from '../embedding/embedding.service'

interface MedicineItem {
  ITEM_SEQ: string
  ITEM_NAME: string
  ENTP_NAME: string
  CHART: string
  ITEM_IMAGE: string
  PRINT_FRONT: string
  PRINT_BACK: string
  DRUG_SHAPE: string
  COLOR_CLASS1: string
  COLOR_CLASS2: string
  LINE_FRONT: string
  LINE_BACK: string
  LENG_LONG: string
  LENG_SHORT: string
  THICK: string
  FORM_CODE_NAME: string
  CLASS_NAME: string
  ETC_OTC_NAME: string
  ITEM_PERMIT_DATE: string
}

interface ApiResponse {
  body: {
    totalCount: number
    numOfRows: number
    pageNo: number
    items: MedicineItem[] | { item: MedicineItem[] }
  }
}

interface DrugInfoItem {
  itemSeq: string
  itemName: string
  entpName: string
  efcyQesitm: string | null
  useMethodQesitm: string | null
  atpnWarnQesitm: string | null
  atpnQesitm: string | null
  intrcQesitm: string | null
  seQesitm: string | null
  depositMethodQesitm: string | null
}

interface DrugInfoResponse {
  body: {
    totalCount: number
    numOfRows: number
    pageNo: number
    items: DrugInfoItem[] | { item: DrugInfoItem[] }
  }
}

@Injectable()
export class IngestionService {
  private readonly apiUrl =
    'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03'
  private readonly drugInfoApiUrl =
    'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList'
  private readonly BATCH_SIZE = 32  // HF API 배치 크기
  private readonly PAGE_SIZE = 100  // API 한 번에 가져올 수량
  private readonly DRUG_INFO_BATCH = 50  // e약은요 API 배치 크기
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

  /** 약 정보를 임베딩용 텍스트로 변환 */
  private toEmbedText(item: MedicineItem): string {
    return [
      item.ITEM_NAME && `약품명: ${item.ITEM_NAME}`,
      item.DRUG_SHAPE && `모양: ${item.DRUG_SHAPE}`,
      item.COLOR_CLASS1 && `색상: ${item.COLOR_CLASS1}${item.COLOR_CLASS2 ? `/${item.COLOR_CLASS2}` : ''}`,
      item.FORM_CODE_NAME && `제형: ${item.FORM_CODE_NAME}`,
      item.PRINT_FRONT && `앞면문자: ${item.PRINT_FRONT}`,
      item.PRINT_BACK && `뒷면문자: ${item.PRINT_BACK}`,
      item.LINE_FRONT && `앞분할선: ${item.LINE_FRONT}`,
      item.LINE_BACK && `뒷분할선: ${item.LINE_BACK}`,
      item.CHART && `성상: ${item.CHART}`,
      item.ENTP_NAME && `제조사: ${item.ENTP_NAME}`,
    ]
      .filter(Boolean)
      .join(', ')
  }

  private async fetchPage(pageNo: number): Promise<{ items: MedicineItem[]; totalCount: number }> {
    // 키는 이미 URL 인코딩된 상태로 .env에 저장 — 그대로 사용
    const url =
      `${this.apiUrl}?serviceKey=${process.env.DATA_GO_KR_API_KEY}` +
      `&pageNo=${pageNo}&numOfRows=${this.PAGE_SIZE}&type=json`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`API error: ${res.status}`)

    const json = (await res.json()) as { body: ApiResponse['body'] }
    const body = json.body
    const rawItems = body.items

    let items: MedicineItem[]
    if (Array.isArray(rawItems)) {
      items = rawItems
    } else if (rawItems && Array.isArray((rawItems as any).item)) {
      items = (rawItems as any).item
    } else {
      items = []
    }

    return { items, totalCount: body.totalCount }
  }

  private async upsertBatch(items: MedicineItem[], embeddings: number[][]): Promise<void> {
    const rowMap = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      rowMap.set(item.ITEM_SEQ, {
        item_seq: item.ITEM_SEQ,
        item_name: item.ITEM_NAME,
        entp_name: item.ENTP_NAME,
        chart: item.CHART,
        item_image: item.ITEM_IMAGE,
        print_front: item.PRINT_FRONT,
        print_back: item.PRINT_BACK,
        drug_shape: item.DRUG_SHAPE,
        color_class1: item.COLOR_CLASS1,
        color_class2: item.COLOR_CLASS2,
        line_front: item.LINE_FRONT,
        line_back: item.LINE_BACK,
        leng_long: item.LENG_LONG,
        leng_short: item.LENG_SHORT,
        thick: item.THICK,
        form_code_name: item.FORM_CODE_NAME,
        class_name: item.CLASS_NAME,
        etc_otc_name: item.ETC_OTC_NAME,
        embedding: embeddings[i],
      })
    }
    const rows = [...rowMap.values()]

    const { error } = await this.supabase
      .from('medicines')
      .upsert(rows, { onConflict: 'item_seq' })

    if (error) throw new Error(`Supabase upsert error: ${error.message}`)
  }

  /** 이미 임베딩 완료된 item_seq 목록 조회 */
  private async getExistingSeqs(): Promise<Set<string>> {
    const seqs = new Set<string>()
    const PAGE = 1000
    let from = 0

    while (true) {
      const { data, error } = await this.supabase
        .from('medicines')
        .select('item_seq')
        .not('embedding', 'is', null)
        .range(from, from + PAGE - 1)

      if (error) {
        console.error('[Ingestion] 기존 임베딩 조회 실패:', error.message)
        break
      }
      if (!data || data.length === 0) break

      for (const row of data) seqs.add(row.item_seq)
      if (data.length < PAGE) break
      from += PAGE
    }

    return seqs
  }

  /** 수집 실행 — 이미 임베딩된 항목은 건너뛰고 나머지만 처리 */
  async run(maxPages?: number): Promise<{ processed: number; total: number }> {
    console.log('[Ingestion] 수집 시작')

    const existingSeqs = await this.getExistingSeqs()
    console.log(`[Ingestion] 이미 임베딩된 항목: ${existingSeqs.size}개 (스킵 예정)`)

    const { items: firstItems, totalCount } = await this.fetchPage(1)
    const totalPages = Math.ceil(totalCount / this.PAGE_SIZE)
    const pagesToFetch = Math.min(maxPages ?? totalPages, totalPages)

    console.log(`[Ingestion] 전체 ${totalCount}개, ${totalPages}페이지 중 ${pagesToFetch}페이지 수집`)

    let processed = 0
    let skipped = 0

    const processPage = async (pageItems: MedicineItem[]) => {
      // 이미 임베딩된 항목 필터링 + 페이지 내 중복 제거
      const seen = new Set<string>()
      const newItems = pageItems.filter((item) => {
        if (existingSeqs.has(item.ITEM_SEQ) || seen.has(item.ITEM_SEQ)) return false
        seen.add(item.ITEM_SEQ)
        return true
      })
      skipped += pageItems.length - newItems.length

      for (let i = 0; i < newItems.length; i += this.BATCH_SIZE) {
        const batch = newItems.slice(i, i + this.BATCH_SIZE)
        const texts = batch.map((item) => this.toEmbedText(item))
        try {
          const embeddings = await this.embeddingService.embedBatch(texts)
          await this.upsertBatch(batch, embeddings)
          processed += batch.length
          console.log(`[Ingestion] ${processed} 신규 처리 / ${skipped} 스킵 (전체 ${totalCount}개)`)
        } catch (err) {
          console.error(`[Ingestion] 배치 오류 (i=${i}):`, err)
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    // 1페이지 먼저 처리
    await processPage(firstItems)

    // 2페이지부터 fetch 즉시 처리 (메모리에 쌓지 않음)
    for (let page = 2; page <= pagesToFetch; page++) {
      const { items } = await this.fetchPage(page)
      await processPage(items)
    }

    console.log(`[Ingestion] 완료 — 신규 ${processed}개 처리, ${skipped}개 스킵`)
    return { processed, total: totalCount }
  }

  /** e약은요 API에서 단일 약 정보 조회 */
  private async fetchDrugInfo(itemSeq: string): Promise<DrugInfoItem | null> {
    const url =
      `${this.drugInfoApiUrl}?serviceKey=${process.env.DATA_GO_KR_API_KEY}` +
      `&itemSeq=${itemSeq}&type=json`

    try {
      const res = await fetch(url)
      if (!res.ok) return null

      const json = (await res.json()) as { body: DrugInfoResponse['body'] }
      const rawItems = json.body?.items
      let items: DrugInfoItem[]

      if (Array.isArray(rawItems)) {
        items = rawItems
      } else if (rawItems && Array.isArray((rawItems as any).item)) {
        items = (rawItems as any).item
      } else {
        return null
      }

      return items[0] ?? null
    } catch {
      return null
    }
  }

  /** HTML 태그 제거 */
  private stripHtml(text: string | null): string | null {
    if (!text) return null
    return text.replace(/<[^>]*>/g, '').trim() || null
  }

  /** e약은요 데이터 수집 — efcy가 없는 약들에 효능/부작용 등 추가 */
  async runDrugInfo(): Promise<{ processed: number; skipped: number; total: number }> {
    console.log('[DrugInfo] e약은요 수집 시작')

    // efcy가 비어있는 item_seq 목록 조회
    const PAGE = 1000
    const seqsToFetch: string[] = []
    let from = 0

    while (true) {
      const { data, error } = await this.supabase
        .from('medicines')
        .select('item_seq')
        .is('efcy', null)
        .range(from, from + PAGE - 1)

      if (error) {
        console.error('[DrugInfo] 조회 실패:', error.message)
        break
      }
      if (!data || data.length === 0) break

      for (const row of data) seqsToFetch.push(row.item_seq)
      if (data.length < PAGE) break
      from += PAGE
    }

    const total = seqsToFetch.length
    console.log(`[DrugInfo] 효능 미수집 항목: ${total}개`)

    let processed = 0
    let skipped = 0

    for (let i = 0; i < seqsToFetch.length; i += this.DRUG_INFO_BATCH) {
      const batch = seqsToFetch.slice(i, i + this.DRUG_INFO_BATCH)

      const results = await Promise.all(
        batch.map(async (seq) => {
          const info = await this.fetchDrugInfo(seq)
          return { seq, info }
        }),
      )

      for (const { seq, info } of results) {
        if (!info || !info.efcyQesitm) {
          skipped++
          continue
        }

        const { error } = await this.supabase
          .from('medicines')
          .update({
            efcy: this.stripHtml(info.efcyQesitm),
            use_method: this.stripHtml(info.useMethodQesitm),
            side_effect: this.stripHtml(info.seQesitm),
            atpn: this.stripHtml(info.atpnQesitm),
            intrc: this.stripHtml(info.intrcQesitm),
            deposit_method: this.stripHtml(info.depositMethodQesitm),
          })
          .eq('item_seq', seq)

        if (error) {
          console.error(`[DrugInfo] 업데이트 실패 (${seq}):`, error.message)
          skipped++
        } else {
          processed++
        }
      }

      console.log(`[DrugInfo] ${processed} 처리 / ${skipped} 스킵 (전체 ${total}개)`)
      await new Promise((r) => setTimeout(r, 200))
    }

    console.log(`[DrugInfo] 완료 — ${processed}개 처리, ${skipped}개 스킵`)
    return { processed, skipped, total }
  }
}
