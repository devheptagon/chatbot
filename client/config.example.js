// Prefer loading config from the API (reads .env server-side):
//
// <script src="http://your-api-host/chatbot-config.js"></script>
//
// When the widget is served from the same host as the API, use a relative path:
//
// <script src="/chatbot-config.js"></script>
//
// Override manually only if needed:
window.CHATBOT_CONFIG = {
  apiUrl: "/chatbot",
  clientApp: "website",
  title: "Chat with us",
  placeholder: "Type your message...",
  theme: {
    primary: "#2563eb",
    position: "bottom-right",
  },
};
