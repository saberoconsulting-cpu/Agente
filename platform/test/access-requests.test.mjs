import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestInput,submitRequest,reviewRequest} from '../src/access-requests.mjs';
const id='12345678-1234-1234-1234-123456789012';
const application={business_name:'Tienda Ejemplo',contact_name:'Ana',email:'ANA@EJEMPLO.PE',phone:'+51 900 000 000'};
test('public applications validate contact details and discard submitted access privileges',()=>{
  const value=requestInput({...application,status:'active',role:'owner',company_id:'sabero',password:'never stored'});
  assert.equal(value.email,'ana@ejemplo.pe');
  assert.deepEqual(Object.keys(value).sort(),['business_name','contact_name','email','phone','phone_country']);
  assert.throws(()=>requestInput({...application,email:'not-an-email'}));
});
test('country selection validates shared prefixes and saves an international number',()=>{
  const canada=requestInput({...application,phone:'416 555 0123',phone_country:'CA'});
  assert.equal(canada.phone,'+14165550123');
  assert.equal(canada.phone_country,'CA');
  assert.throws(()=>requestInput({...application,phone:'+14165550123',phone_country:'US'}));
  assert.throws(()=>requestInput({...application,phone:'123',phone_country:'PE'}));
  assert.throws(()=>requestInput({...application,phone:'+51912345678',phone_country:'XX'}));
});
test('duplicates get the same response and never update an application or password',async()=>{
  let sql;
  const registry={control:{query:async text=>{sql=text;return {rows:[]};}}};
  assert.deepEqual(await submitRequest(registry,'sabero',{...application,password_hash:'scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128)}),{received:true});
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(sql,/UPDATE/i);assert.match(sql,/password_hash/);
});
function reviewHarness(row) {
  let updated=false, tenantTouched=false, released=false;
  const control={query:async (sql,params)=>{
    if(sql.includes('FOR UPDATE')) return {rows:[row]};
    if(sql.startsWith('UPDATE')) {updated=true;return {rows:[]};}
    if(sql.includes('SELECT id,business_name')) return {rows:[row]};
    return {rows:[]};
  },release(){released=true;}};
  const registry={control:{connect:async()=>control},database:async()=>{tenantTouched=true;throw new Error('Unexpected tenant access');}};
  return {registry,state:()=>({updated,tenantTouched,released})};
}
test('pending requests cannot activate accounts even when a company and credentials are supplied',async()=>{
  const h=reviewHarness({status:'pending'});
  await assert.rejects(reviewRequest(h.registry,id,{action:'activate',actor:'admin@test.pe',company_id:'cliente',password_hash:'x'}),/Payment approval/);
  assert.deepEqual(h.state(),{updated:false,tenantTouched:false,released:true});
});
test('approval requires explicit payment confirmation and a reference',async()=>{
  const h=reviewHarness({status:'pending'});
  await assert.rejects(reviewRequest(h.registry,id,{action:'approve',actor:'admin@test.pe',payment_confirmed:false,payment_reference:'receipt'}),/Confirm payment/);
  assert.equal(h.state().updated,false);
  await reviewRequest(h.registry,id,{action:'approve',actor:'admin@test.pe',payment_confirmed:true,payment_reference:'receipt'});
  assert.equal(h.state().updated,true);
  assert.equal(h.state().tenantTouched,false);
});
test('an approved business cannot be placed in the administrator company',async()=>{
  const h=reviewHarness({status:'approved',payment_reference:'receipt',origin_company_id:'sabero'});
  await assert.rejects(reviewRequest(h.registry,id,{action:'activate',actor:'admin@test.pe',company_id:'sabero',password_hash:'scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128)}),/separate company/);
  assert.equal(h.state().tenantTouched,false);
});
