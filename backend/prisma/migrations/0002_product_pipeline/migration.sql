alter table opportunities drop constraint if exists opportunities_stage_check;
alter table opportunities add constraint opportunities_stage_check
  check (stage in ('nuevo','calificado','reunion_propuesta','reunion_agendada','propuesta','reservado','pagado','en_envio','ganado','perdido'));
