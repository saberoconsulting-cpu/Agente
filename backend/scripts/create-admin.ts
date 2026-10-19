import { runCommand } from '../src/cli/run-command';
import { AuthService } from '../src/modules/auth/auth.service';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
void runCommand(async (app) => console.log('Admin user ready', await app.get(AuthService).ensureBootstrapOwner(process.env.ADMIN_COMPANY_ID || process.env.COMPANY_ID || 'sabero', email, password)));
