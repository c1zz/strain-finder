<template>
  <div ref="scrollArea" class="messages">
    <p v-if="!messages.length" class="hint">Noch keine Nachrichten.</p>
    <div v-for="(msg, i) in messages" :key="i" :class="['bubble', msg.role]">
      {{ msg.content }}<span v-if="streaming && i === messages.length - 1" class="cursor">▍</span>
    </div>
  </div>
  <p v-if="chatError" class="error">{{ chatError }}</p>
  <form @submit.prevent="send">
    <input
      v-model="input"
      :disabled="streaming"
      maxlength="4000"
      placeholder="Stelle deine Frage…"
    />
    <button type="submit" :disabled="!input.trim() || streaming">Senden</button>
  </form>
</template>

<script setup>
import { nextTick, ref } from "vue";

const messages = ref([]);
const input = ref("");
const streaming = ref(false);
const chatError = ref("");
const scrollArea = ref(null);

function scrollToBottom() {
  nextTick(() => {
    scrollArea.value?.scrollTo({ top: scrollArea.value.scrollHeight });
  });
}

async function send() {
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  chatError.value = "";
  messages.value.push({ role: "user", content: question });
  streaming.value = true;
  scrollToBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Send the trailing history — the API is stateless.
        messages: messages.value.slice(-20),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error);

    const reply = { role: "assistant", content: "" };
    messages.value.push(reply);

    // Read the server-sent event stream and append text deltas as they arrive.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const event of events) {
        if (!event.startsWith("data: ")) continue;
        const payload = event.slice(6);
        if (payload === "[DONE]") continue;
        const { text, error } = JSON.parse(payload);
        if (error) throw new Error(error);
        reply.content += text;
        scrollToBottom();
      }
    }
  } catch (err) {
    chatError.value = err.message || "Chat fehlgeschlagen.";
  } finally {
    streaming.value = false;
  }
}
</script>

<style scoped>
.messages {
  height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.9rem;
  margin-bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.bubble {
  max-width: 85%;
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  font-size: 0.92rem;
  white-space: pre-wrap;
}

.bubble.user {
  align-self: flex-end;
  background: var(--accent-dark);
}

.bubble.assistant {
  align-self: flex-start;
  background: var(--surface-2);
}

.cursor {
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  font: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 0.55rem 0.8rem;
}

input:focus {
  outline: 1px solid var(--accent);
}
</style>
