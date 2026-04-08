import { Module } from '@nestjs/common'
import { RetrievalModule } from '../retrieval/retrieval.module'
import { BotService } from './bot.service'

@Module({
  imports: [RetrievalModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
