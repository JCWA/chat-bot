import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmbeddingModule } from '../embedding/embedding.module'
import { Medicine } from '../medicine/medicine.entity'
import { IngestionController } from './ingestion.controller'
import { IngestionService } from './ingestion.service'

@Module({
  imports: [TypeOrmModule.forFeature([Medicine]), EmbeddingModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
