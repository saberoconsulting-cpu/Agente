import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiCompletionInput, AiCompletionOutput, AiProvider } from './ai-provider.types';

@Injectable()
export class DeepSeekProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(input: AiCompletionInput): Promise<AiCompletionOutput> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const baseUrl = this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    const model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    const timeout = Number(this.config.get<string>('LLM_TIMEOUT_MS') || 30000);

    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');

    const response = await axios.post(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? Number(this.config.get<string>('LLM_MAX_TOKENS') || 1200),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout,
      },
    );

    return {
      content: response.data?.choices?.[0]?.message?.content || '',
      provider: 'deepseek',
      model,
      raw: response.data,
    };
  }
}
