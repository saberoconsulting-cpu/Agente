export type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiCompletionInput = {
  companyId?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type AiCompletionOutput = {
  content: string;
  provider: string;
  model: string;
  raw?: unknown;
};

export interface AiProvider {
  complete(input: AiCompletionInput): Promise<AiCompletionOutput>;
}
