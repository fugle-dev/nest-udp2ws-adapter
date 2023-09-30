import { SubscribeMessage } from '@nestjs/websockets';
import { MESSAGE_EVENT } from '../constants'

export function IncomingMessage(): MethodDecorator {
  return SubscribeMessage(MESSAGE_EVENT);
}
