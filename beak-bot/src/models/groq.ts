import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGroq } from '@langchain/groq';
import { LLMModel } from './index.js';

export class GroqModel implements LLMModel {
  private model: ChatGroq;

  constructor(apiKey: string, model: string, temperature = 0.8) {
    this.model = new ChatGroq({
      apiKey,
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
      console.error('Error invoking the Groq model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}
