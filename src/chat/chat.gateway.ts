import { Injectable } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { BotService } from '../bot/bot.service'

@Injectable()
@WebSocketGateway({
  namespace: /^\/chat\/\d+$/,
  cors: {
    origin: (origin, callback) => {
      callback(null, true)
    },
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  constructor(private readonly botService: BotService) {}

  private getChatId(client: Socket): string {
    return client.nsp.name.split('/')[2]
  }

  private getUserId(client: Socket): string {
    return (client.handshake.query.userId as string) ?? 'anonymous'
  }

  handleConnection(client: Socket) {
    const userId = this.getUserId(client)
    const chatId = this.getChatId(client)
    console.log(`[Connected] socketId=${client.id} userId=${userId} chatId=${chatId}`)
    client.emit('connection', { chatId })
  }

  handleDisconnect(client: Socket) {
    const userId = this.getUserId(client)
    const chatId = this.getChatId(client)
    console.log(`[Disconnected] socketId=${client.id} userId=${userId} chatId=${chatId}`)
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: { message: string; chatId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { message } = payload
    if (!message || message.trim() === '') return

    const userId = this.getUserId(client)
    const chatId = this.getChatId(client)
    const botUserId = process.env.BOT_USER_ID ?? 'bot'

    // 유저 메시지 브로드캐스트
    client.nsp.emit('receiveMessage', { userId, message })

    // 봇 응답 생성
    try {
      const { message: botReply, medicines } = await this.botService.respond(chatId, message)
      client.nsp.emit('receiveMessage', { userId: botUserId, message: botReply, medicines })
    } catch (error) {
      console.error(`[ChatGateway] 봇 응답 실패:`, error)
      client.emit('receiveMessage', { userId: botUserId, message: '죄송합니다, 잠시 후 다시 시도해 주세요.' })
    }
  }

  @SubscribeMessage('startTyping')
  handleStartTyping(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client)
    const chatId = this.getChatId(client)
    client.broadcast.emit('typingStarted', { userId, chatId })
  }

  @SubscribeMessage('endTyping')
  handleEndTyping(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client)
    const chatId = this.getChatId(client)
    client.broadcast.emit('typingEnded', { userId, chatId })
  }
}
