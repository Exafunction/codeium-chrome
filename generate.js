const { execSync } = require('child_process');

require('dotenv').config();
if (process.env.CODEIUM_ENV === 'monorepo') {
  execSync(
    'npx buf generate ../../.. --path ../../language_server_pb/language_server.proto --include-imports'
  );
} else {
  execSync('npx buf generate');
}
