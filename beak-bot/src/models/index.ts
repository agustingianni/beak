export interface LLMModel {
  invoke(prompt: string, system?: string): Promise<string>;
}

export class Personality {
  constructor(public template: string[]) {}

  // The character belongs in the system role, not glued to the front of the
  // user turn. Measured over 360 calls to hermes-4-70b, folding it into the
  // user message let the model continue the prompt instead of answering it:
  // it echoed the IRC log block back into the channel in 10% of replies to an
  // opinion question, and welded multi line answers into run on text in ~25%.
  // Sent as a system message both rates roughly halve, and with the one line
  // rule in the instructions they reach zero.
  system(): string {
    return this.template.join('\n');
  }
}

export class LLMAgent {
  constructor(private readonly model: LLMModel) {}

  async query(input: string | string[], system?: string): Promise<string> {
    const prompt = Array.isArray(input) ? input.join('\n') : input;
    return this.model.invoke(prompt, system);
  }
}
