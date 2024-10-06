import { debug } from '../logging/index.js';
import { BaseClient } from './index.js';

export class FakeClient extends BaseClient {
  service = 'fakservice';

  send(type: 'public' | 'private', recipient: string, message: string): Promise<void> {
    debug(`Sending ${type} message to ${recipient}: ${message}`);
    return Promise.resolve();
  }

  start(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  stop(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
