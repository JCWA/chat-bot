import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EmbeddingService } from '../embedding/embedding.service'
import { Medicine } from '../medicine/medicine.entity'

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

const UPSERT_COLS = [
  'item_seq', 'item_name', 'entp_name', 'chart', 'item_image', 'print_front',
  'print_back', 'drug_shape', 'color_class1', 'color_class2', 'line_front',
  'line_back', 'leng_long', 'leng_short', 'thick', 'form_code_name',
  'class_name', 'etc_otc_name',
] as const

@Injectable()
export class IngestionService {
  private readonly apiUrl =
    'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03'
  private readonly drugInfoApiUrl =
    'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList'
  private readonly BATCH_SIZE = 32
  private readonly PAGE_SIZE = 100

  constructor(
    @InjectRepository(Medicine)
    private readonly repo: Repository<Medicine>,
    private readonly embeddingService: EmbeddingService,
  ) {}

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

  /** 배치 upsert: item_seq 충돌 시 갱신 */
  private async upsertBatch(items: MedicineItem[], embeddings: number[][]): Promise<void> {
    const uniq = new Map<string, MedicineItem>()
    items.forEach((it, i) => { if (!uniq.has(it.ITEM_SEQ)) uniq.set(it.ITEM_SEQ, it) })

    const cols = [...UPSERT_COLS, 'embedding']
    const placeholders: string[] = []
    const params: unknown[] = []
    let p = 1
    const arr = [...uniq.values()]
    for (const it of arr) {
      const emb = embeddings[items.findIndex((x) => x.ITEM_SEQ === it.ITEM_SEQ)] ?? []
      const vecLit = '[' + emb.map((x) => Number(x).toFixed(7)).join(',') + ']'
      const rowPh: string[] = []
      for (let c = 0; c < UPSERT_COLS.length; c++) rowPh.push(`$${p++}`)
      rowPh.push(`$${p++}::vector`)
      placeholders.push(`(${rowPh.join(',')})`)
      params.push(
        it.ITEM_SEQ, it.ITEM_NAME, it.ENTP_NAME, it.CHART, it.ITEM_IMAGE,
        it.PRINT_FRONT, it.PRINT_BACK, it.DRUG_SHAPE, it.COLOR_CLASS1,
        it.COLOR_CLASS2, it.LINE_FRONT, it.LINE_BACK, it.LENG_LONG,
        it.LENG_SHORT, it.THICK, it.FORM_CODE_NAME, it.CLASS_NAME,
        it.ETC_OTC_NAME, vecLit,
      )
    }

    const updateSet = cols
      .filter((c) => c !== 'item_seq')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ')

    const sql = `
      INSERT INTO medicines (${cols.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (item_seq) DO UPDATE SET ${updateSet}
    `
    await this.repo.manager.query(sql, params)
  }

  private async getExistingSeqs(): Promise<Set<string>> {
    const rows = await this.repo.manager.query(
      'SELECT item_seq FROM medicines WHERE embedding IS NOT NULL',
    ) as { item_seq: string }[]
    return new Set(rows.map((r) => r.item_seq))
  }

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

    await processPage(firstItems)

    for (let page = 2; page <= pagesToFetch; page++) {
      const { items } = await this.fetchPage(page)
      await processPage(items)
    }

    console.log(`[Ingestion] 완료 — 신규 ${processed}개 처리, ${skipped}개 스킵`)
    return { processed, total: totalCount }
  }

  private async fetchDrugInfoPage(pageNo: number): Promise<{ items: DrugInfoItem[]; totalCount: number }> {
    const url =
      `${this.drugInfoApiUrl}?serviceKey=${process.env.DATA_GO_KR_API_KEY}` +
      `&pageNo=${pageNo}&numOfRows=${this.PAGE_SIZE}&type=json`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`DrugInfo API error: ${res.status}`)

    const json = (await res.json()) as { body: DrugInfoResponse['body'] }
    const rawItems = json.body?.items
    let items: DrugInfoItem[]

    if (Array.isArray(rawItems)) {
      items = rawItems
    } else if (rawItems && Array.isArray((rawItems as any).item)) {
      items = (rawItems as any).item
    } else {
      items = []
    }

    return { items, totalCount: json.body?.totalCount ?? 0 }
  }

  private stripHtml(text: string | null): string | null {
    if (!text) return null
    return text.replace(/<[^>]*>/g, '').trim() || null
  }

  async runDrugInfo(): Promise<{ processed: number; skipped: number; total: number }> {
    console.log('[DrugInfo] e약은요 수집 시작 (페이지 단위)')

    const existingRows = await this.repo.manager.query(
      'SELECT item_seq FROM medicines WHERE efcy IS NOT NULL',
    ) as { item_seq: string }[]
    const existingSeqs = new Set(existingRows.map((r) => r.item_seq))
    console.log(`[DrugInfo] 이미 수집된 항목: ${existingSeqs.size}개 (스킵)`)

    const { items: firstItems, totalCount } = await this.fetchDrugInfoPage(1)
    const totalPages = Math.ceil(totalCount / this.PAGE_SIZE)
    console.log(`[DrugInfo] e약은요 전체 ${totalCount}개, ${totalPages}페이지`)

    let processed = 0
    let skipped = 0

    const processItems = async (items: DrugInfoItem[]) => {
      for (const info of items) {
        if (!info.itemSeq || existingSeqs.has(info.itemSeq)) {
          skipped++
          continue
        }
        if (!info.efcyQesitm) {
          skipped++
          continue
        }

        try {
          const result = await this.repo.update(
            { item_seq: info.itemSeq },
            {
              efcy: this.stripHtml(info.efcyQesitm),
              use_method: this.stripHtml(info.useMethodQesitm),
              side_effect: this.stripHtml(info.seQesitm),
              atpn: this.stripHtml(info.atpnQesitm),
              intrc: this.stripHtml(info.intrcQesitm),
              deposit_method: this.stripHtml(info.depositMethodQesitm),
            },
          )
          if (result.affected && result.affected > 0) {
            processed++
            existingSeqs.add(info.itemSeq)
          } else {
            skipped++
          }
        } catch (err) {
          console.error('[DrugInfo] 업데이트 오류:', (err as Error).message)
          skipped++
        }
      }
      console.log(`[DrugInfo] ${processed} 처리 / ${skipped} 스킵 (전체 ${totalCount}개)`)
    }

    await processItems(firstItems)

    for (let page = 2; page <= totalPages; page++) {
      try {
        const { items } = await this.fetchDrugInfoPage(page)
        await processItems(items)
      } catch (err) {
        console.error(`[DrugInfo] 페이지 ${page} 오류:`, err)
      }
      await new Promise((r) => setTimeout(r, 300))
    }

    console.log(`[DrugInfo] 완료 — ${processed}개 처리, ${skipped}개 스킵`)
    return { processed, skipped, total: totalCount }
  }
}
