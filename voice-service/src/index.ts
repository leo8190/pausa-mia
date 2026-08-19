import { loadConfig } from './config.js';
import { createVoiceServer } from './server.js';

const config = loadConfig();
const server = createVoiceServer(config);

server.listen(config.port, '0.0.0.0', () => {
  console.log(
    `argentine-voice-service listening on :${config.port} (backend=${config.backend})`,
  );
});
