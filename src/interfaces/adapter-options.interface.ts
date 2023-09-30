import { SocketType, SocketOptions, BindOptions } from 'dgram';

export interface AdapterOptions {
  type?: SocketType;
  port?: number;
  address?: string;
  socketOptions?: SocketOptions;
  bindOptions?: BindOptions;
  multicastAddress?: string;
  multicastInterface?: string;
}
