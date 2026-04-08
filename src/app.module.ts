import { Module } from '@nestjs/common'
import { BotModule } from './bot/bot.module'
import { ChatModule } from './chat/chat.module'
import { IngestionModule } from './ingestion/ingestion.module'

@Module({
  imports: [BotModule, ChatModule, IngestionModule],
})
export class AppModule {}
