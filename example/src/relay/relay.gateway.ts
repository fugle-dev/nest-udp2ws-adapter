import { WebSocketGateway } from '@nestjs/websockets';
import { IncomingMessage, Relay } from 'nest-udp2ws-adapter';

@WebSocketGateway(8080)
export class RelayGateway {
  @IncomingMessage()
  handleMessage(client: Relay, data: Buffer) {
    return data;
  }
}
