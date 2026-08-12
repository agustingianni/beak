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
  findOrCreateChannel,
  findOrCreateServer,
  findOrCreateUser,
  linkUserToChannel,
  unlinkUserFromChannel
} from '../database/index.js';
import { Debug, Trace, debug, error } from '../logging/index.js';
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
  client: matrixOrgIrc.Client;
  server!: Server;
  self!: User;

  // The server pings roughly every two minutes, 378 seconds at the worst
  // observed. Anything past this means we are not hearing from it at all.
  private readonly SILENCE_LIMIT_MS = 15 * 60 * 1000;
  private readonly WATCHDOG_INTERVAL_MS = 30 * 1000;
  private lastTraffic = Date.now();
  private watchdog: NodeJS.Timeout | undefined;

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

  async handlePublicMessage(senderName: string, channelName: string, messageData: string) {
    this.emit('public-message', {
      sender: senderName,
      channel: channelName,
      content: messageData
    });
  }

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

  async handleJoin(channelName: string, userName: string) {
    const user = await findOrCreateUser(userName);
    const channel = await findOrCreateChannel(channelName, this.server);

    await linkUserToChannel(user.id, channel.id);
  }

  async handlePart(channelName: string, userName: string) {
    const user = await Database.getRepository(User).findOneBy({ name: userName });
    if (!user) {
      error(`Error handling part: user ${userName} not found`);
      return;
    }

    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling part: channel ${channelName} not found`);
      return;
    }

    // Deleting the one join table row cannot disturb anybody else's, unlike
    // loading the whole relation, filtering it and saving it back.
    await unlinkUserFromChannel(user.id, channel.id);
    debug(`Removed user ${userName} from channel ${channelName}`);
  }

  async handleMotd(motd: string) {
    await Database.getRepository(Server).update(this.server.id, { motd });
  }

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

  async handleConnected() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'connected' },
      server: this.server
    });
  }

  async handleNames(channelName: string, users: Map<string, string>) {
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling names: channel ${channelName} not found`);
      return;
    }

    for (const [name] of users) {
      const user = await findOrCreateUser(name);
      await linkUserToChannel(user.id, channel.id);
    }
  }

  async handleTopic(channelName: string, channelTopic: string, userMask: string) {
    // Get the channel.
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      error(`Error handling topic event: channel ${channelName} not found`);
      return;
    }

    // Extract the user name.
    const userName = userMask.match(/^([^!]+)!/)?.[1]!;

    const user = await findOrCreateUser(userName);

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

  async handlePing() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'ping' },
      server: this.server
    });
  }

  async handlePong() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'pong' },
      server: this.server
    });
  }

  async handleRegistered() {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'registered' },
      server: this.server
    });
  }

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

  async handleError(error: any) {
    await Database.getRepository(ServerEvent).save({
      event: { event: 'application-error', error },
      server: this.server
    });
  }

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

    // Watchdog. Every gap over 30 minutes in the server_event table ended only
    // when the process started again, seventeen of them, about eighty days of
    // silence in total, the longest twenty eight days. The connection dies and
    // nothing downstream notices.
    //
    // This deliberately does not try to repair the connection. It watches raw
    // traffic, which is emitted for every inbound line before any of our
    // handlers run. When the line goes quiet it kills the process and lets
    // the container restart policy rebuild everything.
    this.client.addListener('raw', () => {
      this.lastTraffic = Date.now();
    });

    this.lastTraffic = Date.now();
    this.watchdog = setInterval(() => {
      const silentFor = Date.now() - this.lastTraffic;
      if (silentFor < this.SILENCE_LIMIT_MS) {
        return;
      }

      error(
        `No traffic from ${this.settings.server.host} for ${Math.round(silentFor / 1000)}s. ` +
          `The connection is gone and has not come back. Exiting so the container restarts.`
      );

      process.exit(1);
    }, this.WATCHDOG_INTERVAL_MS);

    await new Promise<void>((resolve) => this.client.connect(resolve));
  }

  async stop() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = undefined;
    }

    this.client.removeAllListeners();
    await new Promise<void>((resolve) =>
      this.client.disconnect(
        "Alright, lads, I've got to head off before I start thinking this is a social visit. Take care!",
        resolve
      )
    );
  }
}
