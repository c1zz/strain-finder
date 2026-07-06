<template>
  <article>
    <div class="head">
      <strong>{{ strain.name }}</strong>
      <a :href="strain.url" target="_blank" rel="noopener">Zum Produkt ↗</a>
    </div>
    <div class="terpenes">
      <span v-for="terpene in strain.terpenes" :key="terpene">{{ terpene }}</span>
    </div>
    <p>{{ strain.reason }}</p>
  </article>
</template>

<script setup>
defineProps({ strain: { type: Object, required: true } });
</script>

<style scoped>
article {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.9rem 1rem;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

a {
  color: var(--accent);
  font-size: 0.85rem;
  text-decoration: none;
  white-space: nowrap;
}

a:hover {
  text-decoration: underline;
}

.terpenes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0;
}

.terpenes span {
  font-size: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  color: var(--text-dim);
}

p {
  margin: 0.4rem 0 0;
  font-size: 0.9rem;
}
</style>
