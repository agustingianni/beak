import { Not } from 'typeorm';
import { Database, Message } from '../database/index.js';
import { Line, RecentOptions, Transcript, isCommand } from './index.js';

export class DatabaseTranscript implements Transcript {
  // Commands are dropped in JavaScript rather than in SQL, so that isCommand
  // stays the single definition of what a command is: SQL LIKE cannot say
  // "exclamation mark followed by a word character" without a second, drifting
  // version of the rule. That means the take has to be larger than the limit,
  // or a run of commands would leave the caller short of lines.
  private readonly OVERFETCH = 4;

  async recent(channel: string, limit: number, options: RecentOptions = {}): Promise<Line[]> {
    if (limit <= 0) {
      return [];
    }

    const messages = await Database.getRepository(Message).find({
      where: {
        channel: { name: channel },
        ...(options.excluding ? { sender: { name: Not(options.excluding) } } : {})
      },
      // The database has no reliable ordering by time, so newest first by id
      // and then reverse. Callers never see the DESC order.
      order: { id: 'DESC' },
      take: limit * this.OVERFETCH,
      relations: ['sender', 'channel']
    });

    messages.reverse();

    return messages
      .map((message) => ({
        sender: message.sender.name,
        text: message.data
      }))
      .filter((line) => !isCommand(line.text))
      .slice(-limit);
  }
}
