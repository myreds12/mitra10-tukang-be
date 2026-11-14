import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { VendorPortalStatus } from './vendor-portal.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class VendorPortalGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(VendorPortalGateway.name);

  @WebSocketServer()
  server: any;

  handleConnection(client: Socket) {
    // Client must send 'subscribe' with vendorId as the first message
    // OR we expect the auth token in handshake
    const auth = client.handshake?.auth;
    if (auth?.token) {
      // The client should send its vendorId after connecting.
      // For now, log and rely on explicit subscribe.
      this.logger.log(`WS connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { vendorId: number },
  ) {
    if (payload?.vendorId) {
      client.join(`vendor:${payload.vendorId}`);
      this.logger.log(`Client ${client.id} subscribed to vendor:${payload.vendorId}`);
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { vendorId: number },
  ) {
    if (payload?.vendorId) {
      client.leave(`vendor:${payload.vendorId}`);
    }
  }

  publishStatusUpdate(vendorId: number, status: VendorPortalStatus) {
    if (this.server?.to) {
      this.server.to(`vendor:${vendorId}`).emit('status_update', status);
    }
  }
}
