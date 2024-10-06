export interface LLMModel {
  invoke(prompt: string): Promise<string>;
}

export class Personality {
  constructor(public template: string | string[]) {}

  formatPrompt(prompt: string): string {
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
    private model: LLMModel,
    private personality: Personality
  ) {}

  setPersonality(personality: Personality): void {
    this.personality = personality;
  }

  async query(input: string | string[]): Promise<string> {
    const prompt = this.personality.formatPrompt(Array.isArray(input) ? input.join('\n') : input);
    return await this.model.invoke(prompt);
  }
}
