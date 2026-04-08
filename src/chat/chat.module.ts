import { Module } from '@nestjs/common'
import { BotModule } from '../bot/bot.module'
import { ChatGateway } from './chat.gateway'

@Module({
  imports: [BotModule],
  providers: [ChatGateway],
})
export class ChatModule {}
