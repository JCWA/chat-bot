import { Controller, Get, Module } from '@nestjs/common'
import { BotModule } from './bot/bot.module'
import { ChatModule } from './chat/chat.module'
import { IngestionModule } from './ingestion/ingestion.module'

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}

@Module({
  imports: [BotModule, ChatModule, IngestionModule],
  controllers: [HealthController],
})
export class AppModule {}
