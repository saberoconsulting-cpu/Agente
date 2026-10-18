import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';

@Injectable()
export class EmbeddingsService {
  constructor(private readonly config: ConfigService) {}

  async embedText(text: string): Promise<number[]> {
    const provider = this.config.get<string>('EMBEDDINGS_PROVIDER') || 'local-hash';
    if (provider === 'local-hash') {
      return this.embedWithLocalHash(text);
    }
    if (provider === 'deepseek') {
      return this.embedWithDeepSeek(text);
    }
    throw new Error(`Unsupported embeddings provider: ${provider}`);
  }

  private async embedWithDeepSeek(text: string): Promise<number[]> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const baseUrl = this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    const model = this.config.get<string>('EMBEDDINGS_MODEL') || 'deepseek-embedding';
    const timeout = Number(this.config.get<string>('LLM_TIMEOUT_MS') || 30000);

    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for embeddings');

    const response = await axios.post(
      `${baseUrl.replace(/\/$/, '')}/embeddings`,
      { model, input: text },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout,
      },
    );

    const embedding = response.data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding provider returned an invalid response');
    }

    return embedding;
  }

  private embedWithLocalHash(text: string): number[] {
    const dimensions = Number(this.config.get<string>('EMBEDDINGS_DIMENSIONS') || 1536);
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2);

    for (const token of tokens) {
      const hash = createHash('sha256').update(token).digest();
      const index = hash.readUInt32BE(0) % dimensions;
      const sign = hash[4] % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(6)));
  }
}
