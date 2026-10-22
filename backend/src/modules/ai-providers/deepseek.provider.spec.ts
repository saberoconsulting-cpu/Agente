import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { DeepSeekProvider } from './deepseek.provider';
import { DatabaseService } from '../database/database.service';
jest.mock('axios');

describe('AI usage accounting', () => {
  const post = axios.post as jest.Mock;
  const query = jest.fn();
  const config = new ConfigService({ DEEPSEEK_API_KEY: 'test-only' });
  beforeEach(() => { jest.clearAllMocks(); query.mockResolvedValue({ rows: [] }); });
  it('records provider tokens against the calling company without storing message content', async () => {
    post.mockResolvedValue({ data: { usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 }, choices: [{ message: { content: 'Hola' } }] } });
    const provider = new DeepSeekProvider(config, { query } as unknown as DatabaseService);
    await provider.complete({ companyId: 'empresa-a', messages: [{ role: 'user', content: 'private message' }] });
    const params = query.mock.calls[0][1];
    expect(params[0]).toBe('empresa-a');
    expect(JSON.parse(params[1])).toMatchObject({ prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 });
    expect(params[1]).not.toContain('private message');
  });
  it('keeps unavailable usage unknown instead of inventing tokens', async () => {
    post.mockResolvedValue({ data: {} });
    await new DeepSeekProvider(config, { query } as unknown as DatabaseService).complete({ companyId: 'empresa-b', messages: [] });
    expect(JSON.parse(query.mock.calls[0][1][1]).total_tokens).toBeNull();
  });
  it('does not record unsuccessful provider calls', async () => {
    post.mockRejectedValue(new Error('Unavailable'));
    await expect(new DeepSeekProvider(config, { query } as unknown as DatabaseService).complete({ companyId: 'empresa-a', messages: [] })).rejects.toThrow('Unavailable');
    expect(query).not.toHaveBeenCalled();
  });
});
