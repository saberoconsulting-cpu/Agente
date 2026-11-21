/// <reference types="jest" />
// Prisma loads backend/.env on import; keep platform settings from leaking into unit tests.
const isolated = ['COMPANY_ID', 'PLATFORM_MANAGED', 'MESSAGING_STORE', 'PUBLIC_ACCESS_REQUESTS_ENABLED', 'PLATFORM_ADMIN_EMAILS', 'PLATFORM_ADMIN_COMPANY_ID', 'PLATFORM_ADMIN_TOKEN', 'PLATFORM_API_URL', 'PLATFORM_SERVICE_TOKEN', 'VISION_PROVIDER', 'VISION_API_KEY', 'VISION_MODEL', 'VISION_MODEL_ANTHROPIC', 'VISION_MODEL_OPENAI', 'OAUTH_TOKEN_ENCRYPTION_KEY'];
beforeEach(() => { for (const key of isolated) delete process.env[key]; });
