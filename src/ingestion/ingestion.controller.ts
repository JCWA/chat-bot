import { Body, Controller, Post } from '@nestjs/common'
import { IngestionService } from './ingestion.service'

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /** POST /ingestion/run — 외관 데이터 수집 */
  @Post('run')
  async run(@Body() body: { maxPages?: number }) {
    return this.ingestionService.run(body.maxPages)
  }

  /** POST /ingestion/drug-info — e약은요 효능/부작용 수집 */
  @Post('drug-info')
  async drugInfo() {
    return this.ingestionService.runDrugInfo()
  }
}
