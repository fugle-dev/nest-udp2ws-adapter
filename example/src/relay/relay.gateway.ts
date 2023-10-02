import { WebSocketGateway } from '@nestjs/websockets';
import { IncomingMessage, Relay } from 'nest-udp2ws-adapter';

@WebSocketGateway()
export class RelayGateway {
  @IncomingMessage()
  handleMessage(client: Relay, data: Buffer) {
    return data;
  }
}
