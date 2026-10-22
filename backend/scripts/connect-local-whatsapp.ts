import axios from 'axios';
import { runCommand } from '../src/cli/run-command';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { WhatsappConnectionsService } from '../src/modules/whatsapp/whatsapp-connections.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (process.env.PLATFORM_MANAGED !== 'true' || url.hostname !== '127.0.0.1' || url.port !== '55432') throw new Error('This command is restricted to the local development stack');
  const companyId = process.env.COMPANY_ID!;
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const phone = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const waba = process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phone || !waba) throw new Error('Configure WhatsApp access token, phone number ID and WABA ID in backend/.env');
  let assets: { display_phone_number?: string; verified_name?: string };
  try {
    const result = await axios.get(`https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || 'v25.0'}/${phone}`, {
      params: { fields: 'id,display_phone_number,verified_name' }, headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
    });
    assets = result.data;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new Error(`Meta rejected the configured connection (HTTP ${status || 'network error'}); no connection was changed`);
  }
  await runCommand(async app => {
    const owner = await app.get(PrismaService).adminUser.findFirst({ where: { companyId, role: 'owner', active: true } });
    if (!owner) throw new Error('Create the local owner first');
    await app.get(WhatsappConnectionsService).upsertConnected({ authorization: { sub: owner.id, company_id: companyId,
      email: owner.email, role: owner.role, exp: Math.floor(Date.now() / 1000) + 60 },
      metaAppId: process.env.META_APP_ID, wabaId: waba, phoneNumberId: phone, accessToken: token,
      displayPhoneNumber: assets.display_phone_number, verifiedName: assets.verified_name });
  });
  console.log('Local WhatsApp connection verified and stored encrypted. No message was sent.');
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
