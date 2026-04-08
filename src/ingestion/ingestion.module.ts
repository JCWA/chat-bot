import { Module } from '@nestjs/common'
import { EmbeddingModule } from '../embedding/embedding.module'
import { IngestionController } from './ingestion.controller'
import { IngestionService } from './ingestion.service'

@Module({
  imports: [EmbeddingModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
