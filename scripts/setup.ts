import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
try {
  const adminPassword = randomBytes(18).toString('base64url');
  writeFileSync(
    '.env',
    `HOST=127.0.0.1\nPORT=3000\nDB_PATH=./data/conecta.sqlite\nDEMO_READ_ONLY=false\nADMIN_TOKEN=${randomBytes(32).toString('hex')}\nDEMO_ADMIN_EMAIL=admin@conecta.local\nDEMO_ADMIN_PASSWORD=${adminPassword}\nALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://localhost:8081,http://127.0.0.1:8081\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    '.env local criado. Consulte as credenciais nesse arquivo para abrir o Analytics. Não compartilhe os segredos.',
  );
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
    console.log('.env já existe e foi preservado.');
  else throw error;
}
