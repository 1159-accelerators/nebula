<template>
  <div :class="[props.sent ? 'justify-end' : 'justify-start','row no-wrap']">
    <div>
      <div :class="[nameColor, {'kb-message-sent-name': props.sent}, 'q-pt-sm']">{{ props.name }}</div>
      <div :class="[messageColor, 'q-pa-sm rounded-borders']">
        <slot>
          <div>
            {{ props.text }}
          </div>
          <div v-if="props.references.length > 0" class="q-pt-md">
            <div class="text-bold">References:</div>
            <div v-for="(reference, index) in uniqueLocations" :key="index">
              {{ reference }}
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, PropType } from 'vue';
import { Reference } from 'stores/message-store'
defineOptions({
  name: 'KbChat',
});

const props = defineProps({
  name: {
    type: String,
    default: 'Me',
  },
  nameColor: {
    type: String,
    default: 'gunmetal',
  },
  bgColor: {
    type: String,
    default: 'white',
  },
  sent: {
    type: Boolean,
    default: false,
  },
  textColor: {
    type: String,
    default: 'gunmetal',
  },
  text: {
    type: String,
  },
  references: {
    type: Array as PropType<Reference[]>,
    default: () => []
  }
});

const nameColor = computed(() => `text-${props.nameColor}`);
const messageColor = computed(
  () => `text-${props.textColor}` + ` bg-${props.bgColor}`
);

const uniqueLocations = computed(() => {
  return props.references.map(reference => reference.location.s3Location.uri.slice(5)).filter((v,i,s) => s.indexOf(v) === i)
})
</script>
