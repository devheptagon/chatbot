(function initChatbotWidget() {
  const config = window.CHATBOT_CONFIG ?? {};
  const apiUrl = config.apiUrl ?? "/chatbot";
  const clientApp =
    typeof config.clientApp === "string" && config.clientApp.trim()
      ? config.clientApp.trim()
      : undefined;
  const title = config.title ?? "Chat with us";
  const placeholder = config.placeholder ?? "Type your message...";
  const theme = config.theme ?? {};
  const primary = theme.primary ?? "#2563eb";
  const position = theme.position ?? "bottom-right";

  const history = [];

  const root = document.createElement("div");
  root.className = "chatbot-root";
  root.dataset.position = position;
  root.style.setProperty("--chatbot-primary", primary);

  root.innerHTML = `
    <button class="chatbot-toggle" type="button" aria-label="Open chat" aria-expanded="false">💬</button>
    <section class="chatbot-panel" role="dialog" aria-label="${title}" aria-modal="true">
      <header class="chatbot-header">
        <h2 class="chatbot-title">${title}</h2>
        <button class="chatbot-close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="chatbot-messages" aria-live="polite" aria-relevant="additions"></div>
      <div class="chatbot-status" aria-live="polite"></div>
      <form class="chatbot-form">
        <input class="chatbot-input" type="text" placeholder="${placeholder}" autocomplete="off" />
        <button class="chatbot-send" type="submit">Send</button>
      </form>
    </section>
  `;

  document.body.appendChild(root);

  const toggleButton = root.querySelector(".chatbot-toggle");
  const panel = root.querySelector(".chatbot-panel");
  const closeButton = root.querySelector(".chatbot-close");
  const messagesEl = root.querySelector(".chatbot-messages");
  const statusEl = root.querySelector(".chatbot-status");
  const form = root.querySelector(".chatbot-form");
  const input = root.querySelector(".chatbot-input");
  const sendButton = root.querySelector(".chatbot-send");

  let isOpen = false;
  let isLoading = false;

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    panel.classList.toggle("is-open", isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      input.focus();
    }
  }

  function setStatus(text) {
    statusEl.textContent = text ?? "";
  }

  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chatbot-message ${role}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setLoading(loading) {
    isLoading = loading;
    input.disabled = loading;
    sendButton.disabled = loading;
    setStatus(loading ? "Assistant is typing..." : "");
  }

  async function sendMessage(message) {
    setLoading(true);

    try {
      const payload = { message, history };
      if (clientApp) {
        payload["client-app"] = clientApp;
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          data?.message ??
          (response.status === 429
            ? "Please wait before sending again."
            : "Something went wrong. Please try again.");
        appendMessage("error", errorMessage);
        return;
      }

      const reply = data?.reply;
      if (typeof reply !== "string" || !reply.trim()) {
        appendMessage("error", "Received an empty response.");
        return;
      }

      history.push({ role: "user", parts: [{ text: message }] });
      history.push({ role: "model", parts: [{ text: reply }] });
      appendMessage("assistant", reply);
    } catch {
      appendMessage("error", "Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  toggleButton.addEventListener("click", () => setOpen(!isOpen));
  closeButton.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || isLoading) {
      return;
    }

    input.value = "";
    appendMessage("user", message);
    await sendMessage(message);
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen || event.key !== "Escape") {
      return;
    }
    setOpen(false);
    toggleButton.focus();
  });
})();
