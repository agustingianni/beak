export interface LLMModel {
  invoke(prompt: string): Promise<string>;
}

export class Personality {
  constructor(public template: string | string[]) {}

  format(prompt: string): string {
    if (Array.isArray(this.template)) {
      const template = this.template.join('\n');
      return `${template}\n${prompt}`;
    } else {
      return `${this.template}\n${prompt}`;
    }
  }
}

export class LLMAgent {
  constructor(
    private readonly model: LLMModel,
    public personality?: Personality
  ) {}

  setPersonality(personality: Personality): void {
    this.personality = personality;
  }

  async query(input: string | string[]): Promise<string> {
    const prompt = Array.isArray(input) ? input.join('\n') : input;
    return this.model.invoke(this.personality ? this.personality.format(prompt) : prompt);
  }
}
