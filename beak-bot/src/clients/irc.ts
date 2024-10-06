import { Mutex } from 'async-mutex';
import * as matrixOrgIrc from 'matrix-org-irc';
import {
  Channel,
  ChannelEvent,
  Database,
  Message,
  Notice,
  Server,
  ServerEvent,
  Topic,
  User,
  UserEvent,
  findOrCreateServer,
  findOrCreateUser
} from '../database/index.js';
import { Debug, Trace, debug, error } from '../logging/index.js';
import { WithMutex } from '../utilities/mutex.js';
import { BaseClient } from './index.js';

export interface IRCClientSettings {
  server: {
    host: string;
    port: number;
    secure: boolean;
    password?: string | undefined;
  };
  user: {
    nick: string;
    name: string;
    channel: string;
  };
}

export class IRCClient extends BaseClient {
  service = 'irc';
  mutex: Mutex = new Mutex();
  client: matrixOrgIrc.Client;
  server!: Server;
  self!: User;

  constructor(private settings: IRCClientSettings) {
    super();

    this.client = new matrixOrgIrc.Client(settings.server.host, settings.user.nick, {
      userName: settings.user.nick,
      realName: settings.user.name,
      port: settings.server.port,
      debug: false,
      channels: [settings.user.channel],
      secure: settings.server.secure,
      stripColors: true,
      autoConnect: false
    });
  }

  @Trace
  send(_type: 'public' | 'private', recipient: string, message: string): Promise<void> {
    return this.client.say(recipient, message);
  }

  @WithMutex()
  async handlePublicMessage(senderName: string, channelName: string, messageData: string) {
    this.emit('public-message', {
      sender: senderName,
      channel: channelName,
      content: messageData
    });
  }

  @WithMutex()
  async handlePrivateMessage(senderName: string, recipientName: string, messageData: string) {
    this.emit('private-message', {
      sender: senderName,
      recipient: recipientName,
      content: messageData
    });
  }

  @Trace
  async handleMessage(senderName: string, receiverName: string, messageData: string) {
    if (receiverName.startsWith('#')) {
      await this.handlePublicMessage(senderName, receiverName, messageData);
    } else {
      await this.handlePrivateMessage(senderName, receiverName, messageData);
    }
  }

  @WithMutex()
  async handleJoin(channelName: string, userName: string) {
    let user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      user = await Database.getRepository(User).save({
        name: userName
      });
    }

    let channel = await Database.getRepository(Channel).findOne({
      where: { name: channelName },
      relations: ['users']
    });

    if (!channel) {
      channel = await Database.getRepository(Channel).save({
        name: channelName,
        server: this.server,
        users: [user]
      });
    }

    if (!channel.users.some((u) => u.id === user.id)) {
      channel.users.push(user);
      await Database.getRepository(Channel).save(channel);
    }
  }

  @WithMutex()
  async handlePart(channelName: string, userName: string) {
    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling part: user ${userName} not found`);
      return;
    }

    const channel = await Database.getRepository(Channel).findOne({
      where: { name: channelName },
      relations: ['users']
    });

    if (!channel) {
      error(`Error handling part: channel ${channelName} not found`);
      return;
    }

    // Remove the user from the channel if present.
    if (channel.users.some((u) => u.id === user.id)) {
      channel.users = channel.users.filter((u) => u.id !== user.id);
      await Database.getRepository(Channel).save(channel);
      error(`Removed user ${userName} from channel ${channelName}`);
    }
  }

  @WithMutex()
  async handleMotd(motd: string) {
    await Database.getRepository(Server).update(this.server.id, { motd });
  }

  @WithMutex()
  async handleNotice(from: string, to: string, content: string) {
    let toChannel, toUser, fromUser, fromServer;

    // If the to is not a channel, then it is a user.
    if (to.startsWith('#')) {
      toChannel = await Database.getRepository(Channel).findOneBy({ name: to });
    } else {
      toUser = await Database.getRepository(User).findOneBy({ name: to });
    }

    if (!toChannel && !toUser) {
      error(`Error handling notice: channel or user ${to} not found`);
      return;
    }

    // If the from is not a server, then it is a user.
    fromServer = await Database.getRepository(Server).findOneBy({ name: from });
    if (!fromServer) {
      fromUser = await Database.getRepository(User).findOneBy({ name: from });
    }

    if (!fromServer && !fromUser) {
      error(`Error handling notice: server or user ${from} not found`);
      return;
    }

    const notice = new Notice();
    notice.content = content;
    if (fromUser) notice.fromUser = fromUser;
    if (fromServer) notice.fromServer = fromServer;
    if (toUser) notice.toUser = toUser;
    if (toChannel) notice.toChannel = toChannel;

    await Database.getRepository(Notice).save(notice);
  }

  @WithMutex()
  async handleNickChange(oldNick: string, newNick: string) {
    const { affected } = await Database.getRepository(User).update(
      { name: oldNick },
      { name: newNick }
    );

    if (!affected) {
      error(`Error handling nick change: user ${oldNick} not found`);
      return;
    }
  }

  @WithMutex()
  async handleChannelMode(channelName: string, mode: string) {
    const { affected } = await Database.getRepository(Channel).update(
      { name: channelName },
      { mode }
    );

    if (!affected) {
      error(`Error handling channel mode: channel ${channelName} not found`);
      return;
    }
  }

  @WithMutex()
  async handleConnected() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'connected' },
      server: this.server
    });
  }

  @WithMutex()
  async handleNames(channelName: string, users: Map<string, string>) {
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling names: channel ${channelName} not found`);
      return;
    }

    for (const [name] of users) {
      let user = await Database.getRepository(User).findOne({
        where: { name },
        relations: ['channels']
      });

      if (!user) {
        user = await Database.getRepository(User).save({
          name,
          channels: []
        });
      }

      user.channels.push(channel);
      await Database.getRepository(User).save(user);
    }
  }

  @WithMutex()
  async handleTopic(channelName: string, channelTopic: string, userMask: string) {
    // Get the channel.
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling topic event: channel ${channelName} not found`);
      return;
    }

    // Extract the user name.
    const userName = userMask.match(/^([^!]+)!/)?.[1]!;

    // Create the user if it does not exist.
    let user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      user = await Database.getRepository(User).save({
        name: userName
      });
    }

    if (
      await Database.getRepository(Topic).existsBy({
        topic: channelTopic,
        user,
        channel
      })
    ) {
      debug('Topic already exists, ignoring ...');
      return;
    }

    // Save the topic.
    await Database.getRepository(Topic).save({
      topic: channelTopic,
      user,
      channel
    });
  }

  @WithMutex()
  async handlePing() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'ping' },
      server: this.server
    });
  }

  @WithMutex()
  async handlePong() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'pong' },
      server: this.server
    });
  }

  @WithMutex()
  async handleRegistered() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'registered' },
      server: this.server
    });
  }

  @WithMutex()
  async handleKick(channelName: string, kickedName: string, kickerName: string, reason: string) {
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling kick: channel ${channelName} not found`);
      return;
    }

    await Database.getRepository(ChannelEvent).save({
      event: { event: 'kick', kickedName, kickerName, reason },
      channel
    });
  }

  @WithMutex()
  async handleInvite(channelName: string, userName: string) {
    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling invite: user ${userName} not found`);
      return;
    }

    await Database.getRepository(UserEvent).save({
      event: { event: 'invite', channel: channelName },
      user
    });

    error('invite', channelName, userName);
  }

  @WithMutex()
  async handleQuit(userName: string, reason: string) {
    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling quit: user ${userName} not found`);
      return;
    }

    await Database.getRepository(UserEvent).save({
      event: { event: 'quit', reason },
      user
    });
  }

  // action: (from: string, to: string, action: string, message: Message) => void;

  @Debug
  @WithMutex()
  async handleAction(userName: string, channelName: string, messageData: string) {
    const sender = await Database.getRepository(User).findOneBy({ name: userName });
    if (!sender) {
      error(`Error handling action: user ${userName} not found`);
      return;
    }

    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling action: channel ${channelName} not found`);
      return;
    }

    await Database.getRepository(Message).save({
      data: messageData,
      sender,
      channel,
      action: true
    });
  }

  @WithMutex()
  async handleSetMode(
    channelName: string,
    userName: string,
    mode: string,
    user_: string | undefined
  ) {
    error('setmode', channelName, userName, mode, user_);
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling unsetmode event: channel ${channelName} not found`);
      return;
    }

    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling unsetmode event: user ${userName} not found`);
      return;
    }
  }

  @WithMutex()
  async handleUnsetMode(
    channelName: string,
    userName: string,
    mode: string,
    user_: string | undefined
  ) {
    error('unsetmode', channelName, userName, mode, user_);
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling unsetmode event: channel ${channelName} not found`);
      return;
    }

    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling unsetmode event: user ${userName} not found`);
      return;
    }
  }

  @WithMutex()
  async handleError(error: any) {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'application-error', error },
      server: this.server
    });
  }

  @WithMutex()
  async handleNetworkError(error: Error) {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'network-error', error },
      server: this.server
    });
  }

  async start() {
    this.server = await findOrCreateServer(
      `Server ${this.settings.server.host}:${this.settings.server.port}`,
      this.settings.server.host,
      this.settings.server.port,
      this.settings.server.secure,
      this.settings.server.password ?? ''
    );

    this.self = await findOrCreateUser(this.settings.user.nick);
    await findOrCreateUser('NickServ');

    this.client.addListener('registered', this.handleRegistered.bind(this));
    this.client.addListener('notice', this.handleNotice.bind(this));
    this.client.addListener('nick', this.handleNickChange.bind(this));
    this.client.addListener('motd', this.handleMotd.bind(this));
    this.client.addListener('mode_is', this.handleChannelMode.bind(this));
    this.client.addListener('connect', this.handleConnected.bind(this));
    this.client.addListener('names', this.handleNames.bind(this));
    this.client.addListener('topic', this.handleTopic.bind(this));
    this.client.addListener('ping', this.handlePing.bind(this));
    this.client.addListener('pong', this.handlePong.bind(this));
    this.client.addListener('message', this.handleMessage.bind(this));
    this.client.addListener('join', this.handleJoin.bind(this));
    this.client.addListener('part', this.handlePart.bind(this));
    this.client.addListener('kick', this.handleKick.bind(this));
    this.client.addListener('invite', this.handleInvite.bind(this));
    this.client.addListener('quit', this.handleQuit.bind(this));
    this.client.addListener('action', this.handleAction.bind(this));
    this.client.addListener('+mode', this.handleSetMode.bind(this));
    this.client.addListener('-mode', this.handleUnsetMode.bind(this));
    this.client.addListener('netError', this.handleNetworkError.bind(this));
    this.client.addListener('error', this.handleError.bind(this));

    await new Promise<void>((resolve) => this.client.connect(resolve));
  }

  async stop() {
    this.client.removeAllListeners();
    await new Promise<void>((resolve) =>
      this.client.disconnect(
        "Alright, lads, I've got to head off before I start thinking this is a social visit. Take care!",
        resolve
      )
    );
  }
}
