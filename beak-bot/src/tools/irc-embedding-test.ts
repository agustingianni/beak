import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { Channel, Database, Message } from '../database/index.js';
import { segment } from '../utilities/text.js';
import { debug } from '../logging/index.js';

const channelName = process.argv[2];
if (!channelName) {
  console.error('Please provide a channel as an argument');
  process.exit(1);
}

await Database.initialize();

const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
if (!channel) {
  console.log('Channel not found:', channelName);
  process.exit(1);
}

const messages = await Database.getRepository(Message).find({
  where: { channel: { name: channelName } },
  relations: ['sender', 'channel']
});

console.log(`Loaded ${messages.length} messages from ${channel.name}`);

const conversations = segment(messages, 12, 3);
debug(`Segmented ${messages.length} messages into ${conversations.length} conversations`);

const texts = conversations.map((conversation) =>
  conversation.map((message) => `${message.sender.name}: ${message.data}`).join('\n')
);

const store = await HNSWLib.fromTexts(
  texts,
  texts.map((_value, index) => ({
    id: index
  })),
  new OllamaEmbeddings({
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434'
  })
);

console.log(await store.similaritySearch('proxmox'));
