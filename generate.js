const { execSync } = require('child_process');

require('dotenv').config();
if (process.env.CODEIUM_ENV === 'monorepo') {
  execSync(
    'pnpm buf generate ../../.. --path ../../language_server_pb/language_server.proto --path ../../seat_management_pb/seat_management.proto --path ../../opensearch_clients_pb/opensearch_clients.proto --include-imports'
  );
} else {
  execSync('pnpm buf generate');
}
