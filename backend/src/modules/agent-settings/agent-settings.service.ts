import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type UpdateAgentSettingsInput = {
  agent_name?: string;
  tone?: string;
  language?: string;
  llm_provider?: string;
  llm_model?: string;
  system_rules?: string;
};

export type UpsertServiceInput = {
  id?: string;
  name: string;
  description: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpsertPolicyInput = {
  id?: string;
  policy_key: string;
  policy_text: string;
  active?: boolean;
};

@Injectable()
export class AgentSettingsService {
  constructor(private readonly db: DatabaseService) {}

  async get(companyId: string) {
    const [settings, policies, services] = await Promise.all([
      this.db.query(
        `select *
         from company_agent_settings
         where company_id = $1`,
        [companyId],
      ),
      this.db.query(
        `select id, policy_key, policy_text, active, created_at, updated_at
         from negotiation_policies
         where company_id = $1
         order by policy_key`,
        [companyId],
      ),
      this.db.query(
        `select id, name, description, active, metadata, created_at, updated_at
         from company_services
         where company_id = $1
         order by name`,
        [companyId],
      ),
    ]);

    return {
      company_id: companyId,
      settings: settings.rows[0] || null,
      policies: policies.rows,
      services: services.rows,
    };
  }

  async update(companyId: string, input: UpdateAgentSettingsInput) {
    const result = await this.db.query(
      `update company_agent_settings
       set agent_name = coalesce($2, agent_name),
           tone = coalesce($3, tone),
           language = coalesce($4, language),
           llm_provider = coalesce($5, llm_provider),
           llm_model = coalesce($6, llm_model),
           system_rules = coalesce($7, system_rules),
           updated_at = now()
       where company_id = $1
       returning *`,
      [
        companyId,
        input.agent_name || null,
        input.tone || null,
        input.language || null,
        input.llm_provider || null,
        input.llm_model || null,
        input.system_rules || null,
      ],
    );
    return result.rows[0] || null;
  }

  async upsertService(companyId: string, input: UpsertServiceInput) {
    if (input.id) {
      const result = await this.db.query(
        `update company_services
         set name = $3,
             description = $4,
             active = coalesce($5, active),
             metadata = coalesce($6::jsonb, metadata),
             updated_at = now()
         where company_id = $1 and id = $2
         returning *`,
        [
          companyId,
          input.id,
          input.name,
          input.description,
          input.active ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );
      return result.rows[0] || null;
    }

    const result = await this.db.query(
      `insert into company_services (company_id, name, description, active, metadata)
       values ($1, $2, $3, coalesce($4, true), coalesce($5::jsonb, '{}'::jsonb))
       returning *`,
      [
        companyId,
        input.name,
        input.description,
        input.active ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return result.rows[0];
  }

  async setServiceActive(companyId: string, id: string, active: boolean) {
    const result = await this.db.query(
      `update company_services
       set active = $3, updated_at = now()
       where company_id = $1 and id = $2
       returning *`,
      [companyId, id, active],
    );
    return result.rows[0] || null;
  }

  async deleteService(companyId: string, id: string) {
    const result = await this.db.query(
      `delete from company_services
       where company_id = $1 and id = $2
       returning id`,
      [companyId, id],
    );

    return { deleted: (result.rowCount || 0) > 0, id };
  }

  async upsertPolicy(companyId: string, input: UpsertPolicyInput) {
    if (input.id) {
      const result = await this.db.query(
        `update negotiation_policies
         set policy_key = $3,
             policy_text = $4,
             active = coalesce($5, active),
             updated_at = now()
         where company_id = $1 and id = $2
         returning *`,
        [companyId, input.id, input.policy_key, input.policy_text, input.active ?? null],
      );
      return result.rows[0] || null;
    }

    const result = await this.db.query(
      `insert into negotiation_policies (company_id, policy_key, policy_text, active)
       values ($1, $2, $3, coalesce($4, true))
       on conflict (company_id, policy_key)
       do update set policy_text = excluded.policy_text,
                     active = excluded.active,
                     updated_at = now()
       returning *`,
      [companyId, input.policy_key, input.policy_text, input.active ?? null],
    );
    return result.rows[0];
  }

  async setPolicyActive(companyId: string, id: string, active: boolean) {
    const result = await this.db.query(
      `update negotiation_policies
       set active = $3, updated_at = now()
       where company_id = $1 and id = $2
       returning *`,
      [companyId, id, active],
    );
    return result.rows[0] || null;
  }
}
