import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmbeddingModule } from '../embedding/embedding.module'
import { Medicine } from '../medicine/medicine.entity'
import { RetrievalService } from './retrieval.service'

@Module({
  imports: [TypeOrmModule.forFeature([Medicine]), EmbeddingModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
