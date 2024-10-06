import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LLMModel } from './index.js';

export class OllamaModel implements LLMModel {
  private model: ChatOllama;

  constructor(baseUrl: string, model: string, temperature = 0.7) {
    this.model = new ChatOllama({
      baseUrl,
      model,
      temperature
    });
  }

  async invoke(prompt: string): Promise<string> {
    try {
      return await this.model.pipe(new StringOutputParser()).invoke(prompt);
    } catch (error) {
      console.error('Error invoking the Ollama model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}
