import { Injectable } from '@nestjs/common';
import { LeadsRepository } from './repositories/leads.repository';

@Injectable()
export class LeadsService {
  constructor(private readonly leads: LeadsRepository) {}

  async list(companyId: string, limit = 50) {
    const result = await this.leads.list(companyId, Math.min(Math.max(limit, 1), 200));
    return result.rows;
  }

  async get(companyId: string, id: string) {
    const result = await this.leads.findById(companyId, id);
    return result.rows[0] || null;
  }

  async updateStatus(companyId: string, id: string, status: string) {
    const result = await this.leads.updateStatus(companyId, id, status);
    return result.rows[0] || null;
  }

  async inspectByWhatsAppNumber(companyId: string, phone: string) {
    const result = await this.leads.inspectByWhatsAppNumber(companyId, phone);
    return result.rows;
  }
}
