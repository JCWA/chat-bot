import { Body, Controller, Post } from '@nestjs/common'
import { IngestionService } from './ingestion.service'

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /** POST /ingestion/run?maxPages=5 — 수집 트리거 */
  @Post('run')
  async run(@Body() body: { maxPages?: number }) {
    return this.ingestionService.run(body.maxPages)
  }
}
