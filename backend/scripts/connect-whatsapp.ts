import axios from 'axios';
import { runCommand } from '../src/cli/run-command';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { WhatsappConnectionsService } from '../src/modules/whatsapp/whatsapp-connections.service';

async function main() {
  // Credentials are supplied by the running deployment, never by a browser.
  await runCommand(async app => {
    const companyId = process.env.COMPANY_ID || 'sabero';
    const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
    const phone = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const waba = process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!token || !phone || !waba) throw new Error('WhatsApp environment configuration is incomplete');
    const base = `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || 'v25.0'}`;
    const options = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
    const [assets, numbers] = await Promise.all([
      axios.get<{ id: string; display_phone_number?: string; verified_name?: string }>(`${base}/${phone}`, { ...options, params: { fields: 'id,display_phone_number,verified_name' } }),
      axios.get<{ data: { id: string }[] }>(`${base}/${waba}/phone_numbers`, options),
    ]);
    if (assets.data.id !== phone || !numbers.data.data.some(item => item.id === phone)) throw new Error('Configured phone does not belong to the WhatsApp business account');
    const owner = await app.get(PrismaService).adminUser.findFirst({ where: { companyId, role: 'owner', active: true } });
    if (!owner) throw new Error('An active company owner is required');
    await app.get(WhatsappConnectionsService).upsertConnected({
      authorization: { sub: owner.id, company_id: companyId, email: owner.email, role: owner.role, exp: Math.floor(Date.now() / 1000) + 60 },
      metaAppId: process.env.META_APP_ID, wabaId: waba, phoneNumberId: phone, accessToken: token,
      displayPhoneNumber: assets.data.display_phone_number, verifiedName: assets.data.verified_name,
    });
  });
  console.log('WhatsApp verified and stored encrypted for the configured company. No message was sent.');
}
void main().catch(error => {
  console.error(axios.isAxiosError(error) ? `Meta validation failed (HTTP ${error.response?.status || 'network error'})` : error.message);
  process.exitCode = 1;
});
