import { Not } from 'typeorm';
import { Database, Message } from '../database/index.js';
import { Line, RecentOptions, Transcript } from './index.js';

export class DatabaseTranscript implements Transcript {
  async recent(channel: string, limit: number, options: RecentOptions = {}): Promise<Line[]> {
    const messages = await Database.getRepository(Message).find({
      where: {
        channel: { name: channel },
        ...(options.excluding ? { sender: { name: Not(options.excluding) } } : {})
      },
      // The database has no reliable ordering by time, so newest first by id
      // and then reverse. Callers never see the DESC order.
      order: { id: 'DESC' },
      take: limit,
      relations: ['sender', 'channel']
    });

    messages.reverse();

    return messages.map((message) => ({
      sender: message.sender.name,
      text: message.data
    }));
  }
}
