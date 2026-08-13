import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
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

  async invoke(prompt: string, system?: string): Promise<string> {
    try {
      const messages = system
        ? [new SystemMessage(system), new HumanMessage(prompt)]
        : [new HumanMessage(prompt)];

      const response = await this.model.invoke(messages);
      return response.text;
    } catch (error) {
      console.error('Error invoking the Ollama model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}
