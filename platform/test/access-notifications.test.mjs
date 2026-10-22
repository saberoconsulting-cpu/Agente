import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationMessage,queueNotification,sendBrevo,dispatchNotifications,retryNotification} from '../src/access-notifications.mjs';
const env={ACCESS_NOTIFICATIONS_ENABLED:'true',BREVO_API_KEY:'test-secret',BREVO_SENDER_EMAIL:'sender@example.test',BREVO_REPLY_TO:'support@example.test'};
const payload={decision:'rejected',business_name:'<script>business</script>',contact_name:'A & B',email:'client@business.pe',rejection_reason:'<b>reason</b>',password_hash:'never-leak',payment_reference:'private-payment'};

test('notification templates escape company text and never include credentials or payment references',()=>{
  const message=notificationMessage(payload,env);
  assert.match(message.htmlContent,/&lt;script&gt;/);assert.doesNotMatch(message.htmlContent,/<script>/);
  assert.match(message.htmlContent,/&lt;b&gt;reason/);
  assert.doesNotMatch(JSON.stringify(message),/never-leak|private-payment/);
  assert.equal(message.replyTo.email,env.BREVO_REPLY_TO);
  assert.match(notificationMessage({...payload,decision:'approved'},env).textContent,/preparando/);
  assert.match(notificationMessage({...payload,decision:'active'},env).textContent,/habilitado/);
});
test('queue stores a minimal decision snapshot with deduplication',async()=>{
  const calls=[];await queueNotification({query:async(sql,params)=>{calls.push([sql,params]);}},{...payload,id:'request',status:'rejected'});
  assert.match(calls[1][0],/ON CONFLICT\(request_id,decision\) DO NOTHING/);
  const snapshot=JSON.parse(calls[1][1][2]);assert.equal(snapshot.decision,'rejected');assert.equal(snapshot.email,payload.email);
  assert.equal(snapshot.password_hash,undefined);assert.equal(snapshot.payment_reference,undefined);
  assert.match(calls[0][0],/superseded/);
});
test('Brevo request supports a sandbox proof and a stable idempotency key',async()=>{
  let captured;
  const id=await sendBrevo(payload,env,async(url,options)=>{captured={url,...options};return {ok:true,json:async()=>({messageId:'receipt'})};},true,'request-decision');
  assert.equal(id,'receipt');assert.equal(captured.url,'https://api.brevo.com/v3/smtp/email');assert.equal(captured.headers['api-key'],env.BREVO_API_KEY);
  const body=JSON.parse(captured.body);assert.equal(body.headers['X-Sib-Sandbox'],'drop');assert.equal(body.headers.IdempotencyKey,'request-decision');
});
test('provider rejection exposes only a bounded error code, never the provider response',async()=>{
  await assert.rejects(sendBrevo(payload,env,async()=>({ok:false,status:401,json:async()=>({message:'sensitive provider detail'})})),error=>error.notificationCode==='brevo_401'&&!error.message.includes('sensitive'));
});
function harness(email='client@business.pe') {
  const calls=[];let claimed=false;
  return {calls,registry:{env,control:{query:async(sql,params)=>{calls.push([sql,params]);if(sql.includes('RETURNING *')&&!claimed){claimed=true;return {rows:[{id:'notification',payload:{...payload,email},attempts:1}]};}return {rows:[]};}}}};
}
test('dispatch skips fixture addresses without contacting Brevo',async()=>{
  const h=harness('fake@example.test');let called=false;
  await dispatchNotifications(h.registry,{limit:1,fetcher:async()=>{called=true;}});
  assert.equal(called,false);assert.match(h.calls[1][0],/status='skipped'/);
});
test('dispatch claims with a lease and records Brevo acceptance without claiming delivery',async()=>{
  const h=harness();await dispatchNotifications(h.registry,{limit:1,fetcher:async()=>({ok:true,json:async()=>({messageId:'receipt'})})});
  assert.match(h.calls[0][0],/FOR UPDATE OF n SKIP LOCKED/);assert.match(h.calls[0][0],/r.status=n.decision/);
  assert.match(h.calls[1][0],/status='sent'/);assert.equal(h.calls[1][1][1],'receipt');
});
test('failed sends remain durable and retryable without undoing a decision',async()=>{
  const h=harness();await dispatchNotifications(h.registry,{limit:1,fetcher:async()=>{throw new Error('Network detail');}});
  assert.match(h.calls[1][0],/status='failed'/);assert.match(h.calls[1][0],/next_attempt_at/);assert.equal(h.calls[1][1][1],'network');
});
test('manual retry cannot resend an already accepted or superseded message',async()=>{
  const registry={control:{query:async(sql)=>{assert.match(sql,/n.status='failed'/);assert.match(sql,/n.decision=r.status/);return {rowCount:0};}}};
  await assert.rejects(retryNotification(registry,'request'),/No failed notification/);
});
