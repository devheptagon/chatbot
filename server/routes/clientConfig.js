import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

function resolvePublicApiUrl(req) {
  const configured = config.publicApiUrl;
  if (configured.startsWith('/')) {
    return configured;
  }

  if (config.apiDomain && req.hostname !== config.apiDomain) {
    return '/chatbot';
  }

  return configured;
}

function sendChatbotConfig(req, res) {
  const payload = {
    apiUrl: resolvePublicApiUrl(req),
    clientApp: config.widgetClientApp,
    title: config.widgetTitle,
    placeholder: config.widgetPlaceholder,
    theme: {
      primary: config.widgetPrimaryColor,
      position: config.widgetPosition,
    },
  };

  res.type('application/javascript');
  res.send(`window.CHATBOT_CONFIG = ${JSON.stringify(payload, null, 2)};`);
}

function sendDemoConfig(_req, res) {
  res.type('application/javascript');
  res.send(`window.CHATBOT_CONFIG = {
  ...window.CHATBOT_CONFIG,
  clientApp: "test-website",
};`);
}

router.get('/chatbot-config.js', sendChatbotConfig);
router.get('/chatbot/chatbot-config.js', sendChatbotConfig);
router.get('/demo-config.js', sendDemoConfig);
router.get('/chatbot/demo-config.js', sendDemoConfig);

export default router;
