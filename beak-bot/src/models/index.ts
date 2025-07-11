export interface LLMModel {
  invoke(prompt: string): Promise<string>;
}

export class Personality {
  constructor(public template: string[]) {}

  format(prompt: string): string {
    const template = this.template.join('\n');
    return `${template}\n${prompt}`;
  }
}

export class LLMAgent {
  constructor(private readonly model: LLMModel) {}

  async query(input: string | string[]): Promise<string> {
    const prompt = Array.isArray(input) ? input.join('\n') : input;
    return this.model.invoke(prompt);
  }
}
