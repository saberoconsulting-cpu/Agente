import { Injectable } from '@nestjs/common';
import { LeadsRepository } from './repositories/leads.repository';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class LeadsService {
  constructor(private readonly leads: LeadsRepository) {}

  async list(companyId: string, limit = 50) {
    const result = await this.leads.list(companyId, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);
    return result.rows;
  }

  async roster(companyId:string,filters:{page?:string;search?:string;stage?:string;from?:string;to?:string;assignee?:string}){
    for(const date of [filters.from,filters.to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new BadRequestException('Fecha de filtro no válida');
    const page=Math.max(1,Math.floor(Number(filters.page)||1));
    const result=await this.leads.list(companyId,25,{...filters,search:filters.search?.slice(0,200),offset:(page-1)*25});
    const total=result.rows[0]?.total_count||0;
    return {items:result.rows,total,page,pages:Math.max(1,Math.ceil(total/25))};
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
