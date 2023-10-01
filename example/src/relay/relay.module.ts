import { Module } from '@nestjs/common';
import { RelayGateway } from './relay.gateway';

@Module({
  providers: [RelayGateway]
})
export class RelayModule {}
