import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private onlineUsers = new Map<string, Set<string>>(); // userId -> set of socketIds
  private roomSockets = new Map<string, Set<string>>(); // roomId -> set of socketIds

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (!userId) {
      client.disconnect();
      return;
    }

    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
      this.server.emit('user_status', { userId, status: 'online' });
    }
    this.onlineUsers.get(userId)?.add(client.id);

    client.join(`user_${userId}`);
    this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    
    // Send current online status of others to the new client
    const onlineUserIds = Array.from(this.onlineUsers.keys());
    client.emit('online_users', onlineUserIds);
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId && this.onlineUsers.has(userId)) {
      const sockets = this.onlineUsers.get(userId);
      sockets?.delete(client.id);
      
      if (sockets?.size === 0) {
        this.onlineUsers.delete(userId);
        this.server.emit('user_status', { userId, status: 'offline' });
      }

      // Clean up room memberships for this specific socket
      for (const [roomId, socketIds] of this.roomSockets.entries()) {
        if (socketIds.has(client.id)) {
          socketIds.delete(client.id);
          if (socketIds.size === 0) this.roomSockets.delete(roomId);
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_lead')
  handleJoinLead(
    @MessageBody() leadId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = `lead_${leadId}`;
    client.join(roomId);

    if (!this.roomSockets.has(roomId)) {
      this.roomSockets.set(roomId, new Set());
    }
    this.roomSockets.get(roomId)?.add(client.id);

    return { event: 'joined_lead', data: leadId };
  }

  @SubscribeMessage('leave_lead')
  handleLeaveLead(
    @MessageBody() leadId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = `lead_${leadId}`;
    client.leave(roomId);
    
    if (this.roomSockets.has(roomId)) {
      this.roomSockets.get(roomId)?.delete(client.id);
      if (this.roomSockets.get(roomId)?.size === 0) {
        this.roomSockets.delete(roomId);
      }
    }
    return { event: 'left_lead', data: leadId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { leadId: string; userId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    client.to(`lead_${data.leadId}`).emit('user_typing', data);
  }

  @SubscribeMessage('read_lead')
  handleReadLead(
    @MessageBody() leadId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
       client.to(`lead_${leadId}`).emit('lead_read', { leadId, userId, at: new Date() });
    }
  }

  emitNewMessage(leadId: string, message: any) {
    this.server.to(`lead_${leadId}`).emit('new_message', message);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  isUserInRoom(userId: string, roomId: string): boolean {
    const roomSocketIds = this.roomSockets.get(roomId);
    if (!roomSocketIds) return false;
    
    const userSocketIds = this.onlineUsers.get(userId);
    if (!userSocketIds) return false;

    // If any of the user's sockets are in the room, they are in the room
    for (const socketId of userSocketIds) {
      if (roomSocketIds.has(socketId)) return true;
    }
    
    return false;
  }
}
