import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeCompanyAccess} from '../src/company-access.mjs';
function harness(status='suspended',owner=true,product=true){
  const calls=[];
  return {calls,registry:{env:{PLATFORM_ADMIN_COMPANY_ID:'sabero'},database:async()=>({query:async()=>({rowCount:owner?1:0})}),control:{query:async(sql,params)=>{calls.push([sql,params]);if(sql.startsWith('SELECT *'))return{rows:[{id:'client',status}]};if(sql.includes('platform_products'))return{rowCount:product?1:0};return{rowCount:1,rows:[{id:'client',status:params[1]}]};}}}};
}
test('the platform company cannot suspend or enable itself',async()=>{
  const h=harness();await assert.rejects(changeCompanyAccess(h.registry,'sabero',{action:'suspend',confirmed:true}),/protegida/);assert.equal(h.calls.length,0);
});
test('requires explicit confirmation',async()=>{const h=harness();await assert.rejects(changeCompanyAccess(h.registry,'client',{action:'enable',confirmed:false}),/Confirma/);assert.equal(h.calls.length,0);});
test('reactivation requires an existing agent and active owner',async()=>{
  await assert.rejects(changeCompanyAccess(harness('suspended',false).registry,'client',{action:'enable',confirmed:true}),/propietario/);
  await assert.rejects(changeCompanyAccess(harness('suspended',true,false).registry,'client',{action:'enable',confirmed:true}),/prepararse/);
  const h=harness();assert.deepEqual(await changeCompanyAccess(h.registry,'client',{action:'enable',confirmed:true}),{id:'client',status:'active'});
  assert.match(h.calls.at(-1)[0],/status=\$3 AND deleted_at IS NULL/);
});
test('preparing companies cannot be activated by bypassing request review',async()=>{await assert.rejects(changeCompanyAccess(harness('provisioning').registry,'client',{action:'enable',confirmed:true}),/suspendida/);});
test('suspension only changes the selected active company',async()=>{
  const h=harness('active');assert.deepEqual(await changeCompanyAccess(h.registry,'client',{action:'suspend',confirmed:true}),{id:'client',status:'suspended'});assert.deepEqual(h.calls.at(-1)[1],['client','suspended','active']);
});
