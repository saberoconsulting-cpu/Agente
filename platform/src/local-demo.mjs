import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const dotenv = require(resolve(root, 'backend/node_modules/dotenv'));
const agent = dotenv.parse(await readFile(resolve(root, 'backend/.env')));
const platform = dotenv.parse(await readFile(resolve(root, 'platform/.env')));
const localHosts = new Set(['127.0.0.1', 'localhost']);
const database = new URL(agent.DATABASE_URL);
const control = new URL(platform.CONTROL_DATABASE_URL);
const api = new URL(agent.PLATFORM_API_URL);

if (!localHosts.has(database.hostname) || database.port !== '55432'
  || !localHosts.has(control.hostname) || !localHosts.has(api.hostname)
  || agent.PLATFORM_MANAGED !== 'true') {
  throw new Error('Demo data is restricted to the dedicated local stack');
}

const pool = new pg.Pool({ connectionString: agent.DATABASE_URL, options: '-c search_path=agent,public', max: 1 });
const companyId = agent.COMPANY_ID;
const leads = [
  { id: '10000000-0000-4000-8000-000000000001', conversation: '20000000-0000-4000-8000-000000000001', opportunity: '30000000-0000-4000-8000-000000000001', name: 'Ana Torres', phone: '51900000101', stage: 'nuevo', score: 82, service: 'Automatización de ventas', value: 8500, hours: 2, qualification: { need: 'Responder más rápido a prospectos', scope: 'WhatsApp y seguimiento', urgency: 'Este mes', budget: 'Aprobado', authority: 'Gerente comercial' } },
  { id: '10000000-0000-4000-8000-000000000002', conversation: '20000000-0000-4000-8000-000000000002', opportunity: '30000000-0000-4000-8000-000000000002', name: 'Carlos Mendoza', phone: '51900000102', stage: 'calificado', score: 68, service: 'Agente para WhatsApp', value: 5200, hours: 8, qualification: { need: 'Atender consultas fuera de horario', scope: 'WhatsApp', urgency: '30 días', budget: 'En evaluación', authority: 'Propietario' } },
  { id: '10000000-0000-4000-8000-000000000003', conversation: '20000000-0000-4000-8000-000000000003', opportunity: '30000000-0000-4000-8000-000000000003', name: 'Lucía Ramos', phone: '51900000103', stage: 'reunion_agendada', score: 74, service: 'Integración con Calendar', value: 4200, hours: 20, qualification: { need: 'Automatizar reservas', scope: 'WhatsApp y Calendar', urgency: 'Este trimestre', authority: 'Jefa de operaciones' } },
  { id: '10000000-0000-4000-8000-000000000004', conversation: '20000000-0000-4000-8000-000000000004', opportunity: '30000000-0000-4000-8000-000000000004', name: 'Diego Salazar', phone: '51900000104', stage: 'propuesta', score: 90, service: 'Implementación empresarial', value: 12000, hours: 30, qualification: { need: 'Centralizar la gestión comercial', scope: 'Agente, conocimiento y analítica', urgency: 'Inmediata', budget: 'USD 12 000', authority: 'Director general' } },
  { id: '10000000-0000-4000-8000-000000000005', conversation: '20000000-0000-4000-8000-000000000005', opportunity: '30000000-0000-4000-8000-000000000005', name: 'Valeria Cruz', phone: '51900000105', stage: 'ganado', score: 95, service: 'Agente comercial IA', value: 15000, hours: 48, qualification: { need: 'Escalar ventas', scope: 'Implementación completa', urgency: 'Completada', budget: 'Aprobado', authority: 'Gerente general' } },
  { id: '10000000-0000-4000-8000-000000000006', conversation: '20000000-0000-4000-8000-000000000006', opportunity: '30000000-0000-4000-8000-000000000006', name: 'Jorge Paredes', phone: '51900000106', stage: 'perdido', score: 35, service: 'Chatbot básico', value: 2500, hours: 72, qualification: { need: 'Responder preguntas frecuentes', urgency: 'Sin fecha' } },
];

const dialogue = [
  ['Hola, quiero mejorar la atención de mis prospectos.', '¡Hola, Ana! Podemos ayudarte a automatizar la atención y el seguimiento. ¿Cuántas consultas reciben al mes?', 'Aproximadamente 600 y necesitamos implementarlo este mes.'],
  ['Necesito responder mensajes fuera del horario de oficina.', 'Podemos configurar un agente que atienda las consultas y entregue los casos importantes a tu equipo.', 'Perfecto, quiero conocer el alcance.'],
  ['Quiero que mis clientes puedan reservar una reunión.', 'Podemos consultar disponibilidad y coordinar reuniones con Google Calendar.', 'Ya coordinamos una demostración para mañana.'],
  ['Estamos evaluando una solución para todo el equipo comercial.', 'Preparé una propuesta inicial con agente, base de conocimiento y panel de seguimiento.', 'Gracias, la revisaremos con dirección.'],
  ['La implementación nos está ayudando bastante.', '¡Excelente! Continuaremos monitoreando los resultados y oportunidades.', 'El equipo ya está usando el panel.'],
  ['Por ahora solamente buscaba un chatbot sencillo.', 'Entendido. Si más adelante necesitas automatizar tu proceso comercial, podemos retomarlo.', 'Gracias, lo veremos en otro momento.'],
];

const client = await pool.connect();
try {
  await client.query('begin');
  const owner = (await client.query("select id from admin_users where company_id=$1 and active order by case role when 'owner' then 0 else 1 end limit 1", [companyId])).rows[0];
  if (!owner) throw new Error('Local administrator is required; run npm run local:agent first');

  for (let index = 0; index < leads.length; index++) {
    const lead = leads[index];
    const attention = index === 1 ? { attention: { mode: 'human', assignee_id: owner.id, assignee_name: agent.ADMIN_EMAIL } } : { attention: { mode: 'auto' } };
    await client.query(`insert into leads(id,company_id,whatsapp_number,name,status,qualification,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,now()-($7::text||' hours')::interval,now()-($8::text||' hours')::interval)
      on conflict(id) do update set name=excluded.name,status=excluded.status,qualification=excluded.qualification,updated_at=excluded.updated_at`,
      [lead.id, companyId, lead.phone, lead.name, lead.stage === 'ganado' ? 'customer' : 'active', JSON.stringify({ ...lead.qualification, demo: true }), lead.hours + 24, lead.hours]);
    await client.query(`insert into conversations(id,company_id,lead_id,channel,external_id,state,created_at,updated_at)
      values($1,$2,$3,'whatsapp',$4,$5,now()-($6::text||' hours')::interval,now()-($7::text||' hours')::interval)
      on conflict(id) do update set state=excluded.state,updated_at=excluded.updated_at`,
      [lead.conversation, companyId, lead.id, `demo-local:${index + 1}`, JSON.stringify(attention), lead.hours + 24, lead.hours]);
    await client.query(`insert into opportunities(id,company_id,lead_id,conversation_id,assignee_id,stage,score,score_signals,service_interest,estimated_value,next_action,loss_reason,last_activity_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()-($13::text||' hours')::interval,now()-($14::text||' hours')::interval,now()-($13::text||' hours')::interval)
      on conflict(id) do update set assignee_id=excluded.assignee_id,stage=excluded.stage,score=excluded.score,score_signals=excluded.score_signals,service_interest=excluded.service_interest,estimated_value=excluded.estimated_value,next_action=excluded.next_action,loss_reason=excluded.loss_reason,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at`,
      [lead.opportunity, companyId, lead.id, lead.conversation, index % 2 ? owner.id : null, lead.stage, lead.score,
        JSON.stringify({ need: true, scope: index !== 5, urgency: index < 5, budget: index === 0 || index === 3 || index === 4, authority: index !== 5, recent_activity: lead.hours < 48, demo: true }),
        lead.service, lead.value, lead.stage === 'propuesta' ? 'Revisar propuesta con dirección' : lead.stage === 'reunion_agendada' ? 'Realizar reunión de demostración' : 'Continuar seguimiento',
        lead.stage === 'perdido' ? 'Prioridad aplazada por el cliente' : null, lead.hours, lead.hours + 48]);
  }

  await client.query(`insert into meetings(id,company_id,lead_id,conversation_id,calendar_id,title,description,attendee_name,attendee_email,attendee_phone,start_time,end_time,timezone,status,idempotency_key,raw_response)
    values('40000000-0000-4000-8000-000000000001',$1,$2,$3,'demo-local','Demostración SABERO AI','Reunión ficticia creada solo para visualizar el panel',$4,'lucia.demo@example.test',$5,now()+interval '1 day',now()+interval '1 day 45 minutes','America/Lima','booked','demo-local-meeting','{"demo":true}')
    on conflict(id) do update set start_time=excluded.start_time,end_time=excluded.end_time,updated_at=now()`,
    [companyId, leads[2].id, leads[2].conversation, leads[2].name, leads[2].phone]);
  await client.query(`insert into followups(id,company_id,lead_id,conversation_id,channel,recipient,message,scheduled_at,status,reason,idempotency_key)
    values('50000000-0000-4000-8000-000000000001',$1,$2,$3,'whatsapp',$4,'Hola Carlos, este es un seguimiento ficticio para la vista local.',timestamptz '2099-01-01 10:00:00-05','scheduled','Demo local; fecha lejana para impedir el envío','demo-local-followup')
    on conflict(id) do update set scheduled_at=excluded.scheduled_at,updated_at=now()`,
    [companyId, leads[1].id, leads[1].conversation, leads[1].phone]);

  const documents = [
    ['90000000-0000-4000-8000-000000000001', 'demo-servicios', 'Catálogo de servicios SABERO'],
    ['90000000-0000-4000-8000-000000000002', 'demo-preguntas', 'Preguntas frecuentes comerciales'],
    ['90000000-0000-4000-8000-000000000003', 'demo-politicas', 'Políticas de atención y seguimiento'],
  ];
  for (const [id, source, title] of documents) await client.query(`insert into knowledge_documents(id,company_id,source_type,source_id,title,mime_type,status,metadata)
    values($1,$2,'manual',$3,$4,'text/plain','indexed','{"demo":true}') on conflict(id) do update set title=excluded.title,status='indexed',updated_at=now()`, [id, companyId, source, title]);

  await client.query(`insert into opportunity_proposals(id,company_id,opportunity_id,status,title,content,created_by)
    values('80000000-0000-4000-8000-000000000001',$1,$2,'draft','Propuesta · Implementación empresarial','Documento ficticio para visualizar la oportunidad y sus próximos pasos.',$3)
    on conflict(id) do update set title=excluded.title,content=excluded.content,updated_at=now()`, [companyId, leads[3].opportunity, owner.id]);

  const activities = [
    ['70000000-0000-4000-8000-000000000001', 1, 'opportunity.stage_changed', 'Etapa: calificado'],
    ['70000000-0000-4000-8000-000000000002', 2, 'opportunity.stage_changed', 'Etapa: calificado'],
    ['70000000-0000-4000-8000-000000000003', 3, 'opportunity.proposal_created', 'Borrador de propuesta generado'],
    ['70000000-0000-4000-8000-000000000004', 4, 'opportunity.stage_changed', 'Etapa: ganado'],
    ['70000000-0000-4000-8000-000000000005', 5, 'opportunity.stage_changed', 'Etapa: perdido'],
  ];
  for (const [id, index, type, content] of activities) await client.query(`insert into opportunity_activities(id,company_id,opportunity_id,actor_id,activity_type,content,created_at)
    values($1,$2,$3,$4,$5,$6,now()-($7::text||' hours')::interval) on conflict(id) do update set content=excluded.content,created_at=excluded.created_at`,
    [id, companyId, leads[index].opportunity, owner.id, type, content, leads[index].hours]);

  for (let index = 0; index < 8; index++) await client.query(`insert into agent_events(id,company_id,event_type,aggregate_type,aggregate_id,payload,created_at)
    values($1,$2,'ai.completion','conversation',$3,$4,now()-($5::text||' hours')::interval)
    on conflict(id) do update set payload=excluded.payload,created_at=excluded.created_at`,
    [`60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, companyId, leads[index % leads.length].conversation,
      JSON.stringify({ prompt_tokens: 320 + index * 18, completion_tokens: 110 + index * 9, total_tokens: 430 + index * 27, model: 'demo-local' }), index * 3 + 1]);

  await client.query('commit');

  let insertedMessages = 0;
  for (let leadIndex = 0; leadIndex < leads.length; leadIndex++) {
    for (let messageIndex = 0; messageIndex < dialogue[leadIndex].length; messageIndex++) {
      const inbound = messageIndex !== 1;
      const response = await fetch(`${agent.PLATFORM_API_URL}/v1/messages`, { method: 'POST', headers: {
        Authorization: `Bearer ${agent.PLATFORM_SERVICE_TOKEN}`, 'X-Company-Id': companyId, 'content-type': 'application/json',
      }, body: JSON.stringify({
        id: `b0000000-0000-4000-${String(8000 + leadIndex).padStart(4, '0')}-${String(messageIndex + 1).padStart(12, '0')}`,
        conversationId: leads[leadIndex].conversation,
        providerMessageId: `demo-local:${leadIndex + 1}:${messageIndex + 1}`,
        direction: inbound ? 'inbound' : 'outbound', messageType: 'text', textBody: dialogue[leadIndex][messageIndex],
        createdAt: new Date(Date.now() - (leads[leadIndex].hours * 60 + (dialogue[leadIndex].length - messageIndex) * 8) * 60000).toISOString(),
        presentation: { sender: inbound ? 'contact' : 'ai' }, rawPayload: { demo: true },
      }) });
      if (!response.ok) throw new Error(`Demo message could not be stored (${response.status})`);
      if ((await response.json()).inserted) insertedMessages++;
    }
  }
  console.log(`Demo local ready: ${leads.length} contacts, ${leads.length} opportunities, ${insertedMessages} new messages, 1 meeting and 3 documents.`);
  console.log('Refresh http://127.0.0.1:5173. No WhatsApp message or external request was sent.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message.replace(/(?:postgres(?:ql)?|mongodb):\/\/\S+/g, '[connection redacted]'));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
