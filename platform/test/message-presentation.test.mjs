import test from 'node:test';
import assert from 'node:assert/strict';
import {messageInput} from '../src/domain.mjs';
import {presentMessage} from '../src/messages.mjs';
test('human attribution survives message ingestion without exposing provider payloads',()=>{
  const message=messageInput({id:'one',conversationId:'chat',direction:'outbound',messageType:'text',textBody:'Hola',rawPayload:{secret:'hidden'},presentation:{sender:'human',sender_name:'Asesor'}});
  const safe=presentMessage(message);assert.equal(safe.presentation.sender,'human');assert.equal(safe.presentation.sender_name,'Asesor');assert.equal(safe.rawPayload,undefined);
});
test('legacy stored attachments can be opened without returning raw webhook bodies',()=>{
  const safe=presentMessage({id:'one',direction:'inbound',rawPayload:{document:{id:'meta-file',filename:'propuesta.pdf',mime_type:'application/pdf'}}});
  assert.equal(safe.presentation.attachment.id,'meta-file');assert.equal(safe.presentation.sender,'contact');assert.equal(safe.rawPayload,undefined);
});
