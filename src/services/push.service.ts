import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

class PushService {
  private initialized = false;

  constructor() {
    this.initVapid();
  }

  private initVapid() {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      console.log('[Push] Generating new VAPID keys...');
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;

      // Append to .env file
      let envContent = '';
      try {
        envContent = fs.readFileSync(envPath, 'utf-8');
      } catch {}
      
      if (!envContent.includes('VAPID_PUBLIC_KEY')) {
        envContent += `\nVAPID_PUBLIC_KEY=${publicKey}`;
      }
      if (!envContent.includes('VAPID_PRIVATE_KEY')) {
        envContent += `\nVAPID_PRIVATE_KEY=${privateKey}`;
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');
      
      // Update process.env
      process.env.VAPID_PUBLIC_KEY = publicKey;
      process.env.VAPID_PRIVATE_KEY = privateKey;
      
      console.log('[Push] VAPID keys generated and saved to .env');
    }

    try {
      webpush.setVapidDetails(
        'mailto:admin@casino463.com',
        publicKey,
        privateKey
      );
      this.initialized = true;
      console.log('[Push] VAPID configured successfully');
    } catch (err) {
      console.error('[Push] Failed to configure VAPID:', err);
    }
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || '';
  }

  async sendToSubscription(subscription: any, payload: { title: string; body: string; icon?: string; badge?: string; url?: string; vibrate?: number[] }): Promise<boolean> {
    if (!this.initialized) return false;
    
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        { TTL: 60 * 60 } // 1 hour TTL
      );
      return true;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or invalid
        return false; // Caller should remove this subscription
      }
      console.error('[Push] Send error:', err.statusCode || err.message);
      return false;
    }
  }

  async sendToMultiple(subscriptions: any[], payload: { title: string; body: string; icon?: string; badge?: string; url?: string; vibrate?: number[] }): Promise<{ delivered: number; failed: number; expiredEndpoints: string[] }> {
    let delivered = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const success = await this.sendToSubscription(sub, payload);
        if (success) {
          delivered++;
        } else {
          failed++;
          // Check if subscription is gone (410/404)
          expiredEndpoints.push(sub.endpoint);
        }
      })
    );

    return { delivered, failed, expiredEndpoints };
  }
}

export const pushService = new PushService();
