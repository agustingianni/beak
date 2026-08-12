// A channel transcript, in the order a human would read it: oldest line first.
//
// Four plugins used to hand roll the same TypeORM query, each one responsible
// for remembering to ask for the sender and channel relations and to reverse
// the DESC result. Getting either wrong is silent: you still get lines, they
// are just the wrong ones or in the wrong order. That belongs in one place.
export type Line = {
  sender: string;
  text: string;
};

export type RecentOptions = {
  // Skip lines written by this nickname. Used when we want to react to what
  // the humans have been saying without feeding our own output back in.
  excluding?: string;
};

export interface Transcript {
  // Returns at most `limit` lines, oldest first. A channel with no messages
  // yields an empty array rather than throwing.
  recent(channel: string, limit: number, options?: RecentOptions): Promise<Line[]>;
}
