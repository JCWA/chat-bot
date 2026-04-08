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

@Injectable()
export class IngestionService {
  private readonly apiUrl =
    'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03'
  private readonly BATCH_SIZE = 10  // HF API 배치 크기
  private readonly PAGE_SIZE = 100  // API 한 번에 가져올 수량
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
    const rows = items.map((item, i) => ({
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
    }))

    const { error } = await this.supabase
      .from('medicines')
      .upsert(rows, { onConflict: 'item_seq' })

    if (error) throw new Error(`Supabase upsert error: ${error.message}`)
  }

  /** 수집 실행 — maxPages 미지정 시 전체 수집 */
  async run(maxPages?: number): Promise<{ processed: number; total: number }> {
    console.log('[Ingestion] 수집 시작')

    const { items: firstItems, totalCount } = await this.fetchPage(1)
    const totalPages = Math.ceil(totalCount / this.PAGE_SIZE)
    const pagesToFetch = Math.min(maxPages ?? totalPages, totalPages)

    console.log(`[Ingestion] 전체 ${totalCount}개, ${totalPages}페이지 중 ${pagesToFetch}페이지 수집`)

    let processed = 0
    const allPages = [firstItems]

    for (let page = 2; page <= pagesToFetch; page++) {
      const { items } = await this.fetchPage(page)
      allPages.push(items)
    }

    for (const pageItems of allPages) {
      // BATCH_SIZE 단위로 임베딩
      for (let i = 0; i < pageItems.length; i += this.BATCH_SIZE) {
        const batch = pageItems.slice(i, i + this.BATCH_SIZE)
        const texts = batch.map((item) => this.toEmbedText(item))

        try {
          const embeddings = await this.embeddingService.embedBatch(texts)
          await this.upsertBatch(batch, embeddings)
          processed += batch.length
          console.log(`[Ingestion] ${processed}/${totalCount} 처리 완료`)
        } catch (err) {
          console.error(`[Ingestion] 배치 오류 (i=${i}):`, err)
        }

        // HF API rate limit 방지
        await new Promise((r) => setTimeout(r, 300))
      }
    }

    console.log(`[Ingestion] 완료 — ${processed}개 처리`)
    return { processed, total: totalCount }
  }
}
