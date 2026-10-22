import type { StoredMessage } from '../platform/message-store.service';

export interface ConversationMessage {
  id: string;
  company_id: string;
  conversation_id: string;
  provider_message_id?: string | null;
  direction: string;
  message_type: string;
  text_body?: string | null;
  created_at?: Date | string;
  inbound_event_id?: string | null;
}

export interface ConversationMessagePage {
  items: ConversationMessage[];
  next_cursor: string | null;
}

export function toConversationMessage(message: StoredMessage): ConversationMessage {
  return {
    id: message.id,
    company_id: message.companyId,
    conversation_id: message.conversationId,
    provider_message_id: message.providerMessageId,
    direction: message.direction,
    message_type: message.messageType,
    text_body: message.textBody,
    created_at: message.createdAt,
    ...(message.inboundEventId === undefined ? {} : { inbound_event_id: message.inboundEventId }),
  };
}
