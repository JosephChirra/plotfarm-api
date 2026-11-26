import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

// Initialize firebase admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch(e) {
    console.error('Firebase Admin init failed. Set GOOGLE_APPLICATION_CREDENTIALS for FCM to work.', e);
  }
}

@Injectable()
@Processor('push_notifications')
export class PushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  async process(job: Job<any>) {
    const { tokens, title, message, data } = job.data;
    if (!tokens || tokens.length === 0) return;

    // Convert data to Record<string, string> as required by FCM
    const stringifiedData: Record<string, string> = {};
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        stringifiedData[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
      }
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title,
          body: message,
        },
        data: stringifiedData,
      });
      
      this.logger.debug(`Successfully sent ${response.successCount} push notifications`);
    } catch (error) {
      this.logger.error('Error sending push notification', error);
      throw error;
    }
  }
}
