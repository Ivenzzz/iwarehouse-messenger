import { config } from 'dotenv';
import { join } from 'path';

// Prisma may load the repository-root .env while its client module is imported.
// Load the API-specific file first so local Node development uses localhost;
// Values supplied to a production container remain authoritative.
config({
  path: join(__dirname, '..', '.env'),
  override: process.env.NODE_ENV !== 'production',
});
