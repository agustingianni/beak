import { Channel, Database, Message, Server, User } from '../database/index.js';
import { debug } from '../logging/index.js';
import { BaseBot } from './index.js';

export class FakeBot extends BaseBot {
  async start(): Promise<void> {
    let server = await Database.getRepository(Server).findOneBy({ name: 'test-server' });
    if (!server) {
      server = await Database.getRepository(Server).save({
        name: 'test-server',
        hostname: 'test-server-hostname'
      });
    }

    let channel = await Database.getRepository(Channel).findOneBy({ name: this.channel });
    if (!channel) {
      channel = await Database.getRepository(Channel).save({
        name: this.channel,
        server
      });

      let bot = await Database.getRepository(User).findOneBy({ name: this.nick });
      if (!bot) {
        bot = await Database.getRepository(User).save({
          name: this.nick,
          channels: []
        });
      }
    }
  }

  async fakeMessage(user: string, content: string) {
    const sender = await Database.getRepository(User).save({
      name: user
    });

    const channel = await Database.getRepository(Channel).findOneBy({ name: this.channel });
    if (!channel) {
      throw new Error(`Channel ${this.channel} does not exist`);
    }

    const message = await Database.getRepository(Message).save({
      data: content,
      sender,
      channel
    });

    await this.addMessage({
      id: message.id,
      sender: user,
      channel: this.channel,
      content
    });
  }

  async stop(): Promise<void> {}

  async send(_type: 'public' | 'private', _recipient: string, content: string): Promise<void> {
    debug('send', _type, _recipient, content);
    const sender = await Database.getRepository(User).save({
      name: this.nick
    });

    const channel = await Database.getRepository(Channel).findOneBy({ name: this.channel });
    if (!channel) {
      throw new Error(`Channel ${this.channel} does not exist`);
    }

    await Database.getRepository(Message).save({
      data: content,
      sender,
      channel
    });
  }
}
