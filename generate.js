const { execSync } = require('child_process');

require('dotenv').config();
if (process.env.CODEIUM_ENV === 'monorepo') {
  execSync(
    'npx buf generate ../../.. --path ../../codeium_common_pb/codeium_common.proto --path ../../language_server_pb/language_server.proto --path ../../chat_pb/chat.proto'
  );
} else {
  execSync('npx buf generate');
}
