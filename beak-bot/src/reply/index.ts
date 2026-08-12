import chalk from 'chalk';
import { debug } from '../logging/index.js';
import { LLMAgent } from '../models/index.js';
import { OutputMessage } from '../utilities/messages.js';

// Everything Reply needs from the bot, and nothing else. BaseBot satisfies
// this structurally, so index.ts can pass the bot straight in, but Reply
// cannot reach the agent, the plugin list or the personality through it.
export interface ReplySink {
  readonly nick: string;
  send(type: 'public' | 'private', recipient: string, content: string): Promise<void>;
}

// One prompt in, one cleaned message out and on the wire.
//
// Oracle, shitpost and read each used to run the same five steps by hand: join
// the prompt lines, time the query, log the result, run OutputMessage.cleanup,
// send. Read skipped the cleanup, which is how think blocks and curly quotes
// reached the channel through "!read". With the steps behind one method there
// is no longer a version of this that forgets one.
export class Reply {
  constructor(
    private agent: LLMAgent,
    private sink: ReplySink
  ) {}

  // Returns the text that was actually sent, after cleanup. Throws if the
  // model call fails, so callers can decide what to say about the failure.
  async publish(
    type: 'public' | 'private',
    recipient: string,
    prompt: string[]
  ): Promise<string> {
    const start = Date.now();
    const response = await this.agent.query(prompt);
    debug(`Response generated in ${Date.now() - start}ms`);

    // A multi line answer means the model ignored the "keep it short"
    // instruction, so it is worth spotting in the log at a glance.
    debug(response.includes('\n') ? chalk.redBright(response) : chalk.greenBright(response));

    const content = OutputMessage.cleanup(response, this.sink.nick);
    await this.sink.send(type, recipient, content);

    return content;
  }
}
