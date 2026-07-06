<template>
  <div class="picker">
    <label v-for="effect in effects" :key="effect" :class="{ active: model.includes(effect) }">
      <input type="checkbox" :value="effect" v-model="model" />
      {{ effect }}
    </label>
  </div>
</template>

<script setup>
defineProps({ effects: { type: Array, required: true } });
const model = defineModel({ type: Array, required: true });
</script>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0 1.25rem;
}

label {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.9rem;
  cursor: pointer;
  background: var(--surface-2);
  user-select: none;
}

label.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #131807;
  font-weight: 600;
}

input {
  display: none;
}
</style>
