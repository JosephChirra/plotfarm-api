import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import type { NotificationPayload } from '../notifications.service';

@Injectable()
export class NotificationsListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('notification.send')
  async handleNotificationSend(payload: NotificationPayload) {
    await this.notificationsService.sendNotification(payload);
  }
}
