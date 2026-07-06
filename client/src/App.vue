<template>
  <header>
    <h1>🌿 Strain Finder</h1>
    <p class="hint">
      KI-gestützte Sortenempfehlung für medizinisches Cannabis — basierend auf
      Terpen-Profilen echter Apothekenprodukte.
    </p>
  </header>

  <section>
    <h2>Empfehlung nach Wirkung</h2>
    <p class="hint">Gewünschte Effekte auswählen (Mehrfachauswahl möglich):</p>
    <EffectPicker v-model="selected" :effects="effects" />
    <button :disabled="!selected.length || loading" @click="recommend">
      {{ loading ? "Claude denkt nach…" : "Sorten empfehlen" }}
    </button>
    <p v-if="recommendError" class="error">{{ recommendError }}</p>
    <div v-if="strains.length" class="results">
      <StrainCard v-for="strain in strains" :key="strain.url" :strain="strain" />
    </div>
  </section>

  <section>
    <h2>Chat mit dem Sprachmodell</h2>
    <p class="hint">
      Fragen zu Cannabis, Terpenen und deren Wirkung — Antworten werden live
      gestreamt.
    </p>
    <ChatPanel />
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import EffectPicker from "./components/EffectPicker.vue";
import StrainCard from "./components/StrainCard.vue";
import ChatPanel from "./components/ChatPanel.vue";

const effects = ref([]);
const selected = ref([]);
const strains = ref([]);
const loading = ref(false);
const recommendError = ref("");

onMounted(async () => {
  const res = await fetch("/api/effects");
  effects.value = (await res.json()).effects;
});

async function recommend() {
  loading.value = true;
  recommendError.value = "";
  strains.value = [];
  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effects: selected.value }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    strains.value = (await res.json()).strains;
  } catch (err) {
    recommendError.value = err.message || "Empfehlung fehlgeschlagen.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.results {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
</style>
