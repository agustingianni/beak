import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatGroq } from '@langchain/groq';
import { LLMModel } from './index.js';

export class GroqModel implements LLMModel {
  private model: ChatGroq;

  constructor(apiKey: string, model: string, temperature = 0.9) {
    this.model = new ChatGroq({
      apiKey,
      model,
      temperature
    });
  }

  async invoke(prompt: string): Promise<string> {
    try {
      return await this.model.pipe(new StringOutputParser()).invoke(prompt);
    } catch (error) {
      console.error('Error invoking the Groq model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}
