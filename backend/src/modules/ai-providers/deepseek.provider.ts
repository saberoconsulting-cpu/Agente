import { Injectable, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiCompletionInput, AiCompletionOutput, AiProvider } from './ai-provider.types';

@Injectable()
export class DeepSeekProvider implements AiProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);
  constructor(private readonly config: ConfigService, @Optional() private readonly db?: DatabaseService) {}

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

    if (input.companyId && this.db) {
      const usage = response.data?.usage;
      const tokens = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
      try {
        await this.db.query(`insert into agent_events(company_id,event_type,aggregate_type,payload)
          values($1,'ai.completion','ai',$2::jsonb)`, [input.companyId, JSON.stringify({ provider: 'deepseek', model,
            prompt_tokens: tokens(usage?.prompt_tokens), completion_tokens: tokens(usage?.completion_tokens),
            total_tokens: tokens(usage?.total_tokens) })]);
      } catch {
        this.logger.error('AI usage could not be recorded');
      }
    }
    return {
      content: response.data?.choices?.[0]?.message?.content || '',
      provider: 'deepseek',
      model,
      raw: response.data,
    };
  }
}
