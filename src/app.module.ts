import { Controller, Get, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BotModule } from './bot/bot.module'
import { ChatModule } from './chat/chat.module'
import { IngestionModule } from './ingestion/ingestion.module'
import { Medicine } from './medicine/medicine.entity'

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Medicine],
      synchronize: false,
      logging: false,
    }),
    BotModule,
    ChatModule,
    IngestionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
