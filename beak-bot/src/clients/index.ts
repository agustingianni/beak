import { EventEmitter } from 'events';

export interface BaseClientMessage {
  channel: string;
  user: string;
  content: string;
}

export type PublicMessage = {
  sender: string;
  channel: string;
  content: string;
};

export type PrivateMessage = {
  sender: string;
  recipient: string;
  content: string;
};

export type ClientEvents = {
  'public-message': PublicMessage;
  'private-message': PrivateMessage;
};

export abstract class BaseClient {
  protected emitter: EventEmitter = new EventEmitter();

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(type: 'public' | 'private', recipient: string, message: string): Promise<void>;

  on<K extends keyof ClientEvents>(event: K, handler: (event: ClientEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  emit<K extends keyof ClientEvents>(event: K, payload: ClientEvents[K]) {
    return this.emitter.emit(event, payload);
  }
}
