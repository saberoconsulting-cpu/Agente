/// <reference types="jest" />
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const query = jest.fn();
  const controller = new HealthController({ $queryRaw: query } as unknown as PrismaService);

  afterEach(() => jest.resetAllMocks());

  it('reports ready after the database responds', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ ok: true, service: 'sabero-ai-sales-engine' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without leaking database credentials when the database fails', async () => {
    query.mockRejectedValue(new Error('postgresql://private:secret@database'));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toThrow('El servicio todavía no está disponible.');
  });
});
