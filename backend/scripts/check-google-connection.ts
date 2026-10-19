import { runCommand } from '../src/cli/run-command';
import { GoogleOAuthTokenService } from '../src/modules/integrations/google/google-oauth-token.service';

void runCommand(async (app) => console.log(JSON.stringify(await app.get(GoogleOAuthTokenService).inspectConnection(process.env.COMPANY_ID || 'sabero'), null, 2)));
