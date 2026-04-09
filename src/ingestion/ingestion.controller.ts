import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { IngestionService } from './ingestion.service'

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  private checkApiKey(apiKey?: string) {
    const expected = process.env.INGESTION_API_KEY
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid API key')
    }
  }

  /** POST /ingestion/run — 외관 데이터 수집 */
  @Post('run')
  async run(@Body() body: { maxPages?: number }, @Headers('x-api-key') apiKey?: string) {
    this.checkApiKey(apiKey)
    return this.ingestionService.run(body.maxPages)
  }

  /** POST /ingestion/drug-info — e약은요 효능/부작용 수집 */
  @Post('drug-info')
  async drugInfo(@Headers('x-api-key') apiKey?: string) {
    this.checkApiKey(apiKey)
    return this.ingestionService.runDrugInfo()
  }
}
