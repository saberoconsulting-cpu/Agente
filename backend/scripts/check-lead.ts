import { runCommand } from '../src/cli/run-command';
import { LeadsService } from '../src/modules/leads/leads.service';

const phone = process.argv[2];
if (!phone) throw new Error('Usage: npm run lead:check -- <whatsapp_number>');
void runCommand(async (app) => console.log(JSON.stringify(await app.get(LeadsService).inspectByWhatsAppNumber(process.env.COMPANY_ID || 'sabero', phone), null, 2)));
