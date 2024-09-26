<template>
  <q-page-container>
    <q-page class="row items-end justify-evenly kb-page bg-secondary">
      <div class="kb-container">
        <template
          v-for="(message, index) in messageStore.messages"
          :key="index"
        >
          <kb-chat
            name="Me"
            :text="message.text"
            sent
            bg-color="primary"
            text-color="white"
            v-if="message.sender === 'me'"
          />
          <kb-chat
            name="Nebula (11:59)"
            :text="message.text"
            bg-color="white"
            text-color="gunmetal"
            :references="message.references"
            v-else
          />
        </template>
        <kb-chat
          name="Nebula (11:59)"
          bg-color="white"
          text-color="gunmetal"
          v-if="uiStore.waiting"
          ><q-spinner-dots size="2rem"></q-spinner-dots
        ></kb-chat>
        <div id="scroll-placeholder" ref="scrollPlaceholderRef"></div>
      </div>
    </q-page>
  </q-page-container>
  <kb-footer />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUiStore } from 'stores/ui-store';
import { useAuthStore } from 'src/stores/auth-store';
import { useMessageStore } from 'src/stores/message-store';
import KbChat from 'src/components/KbChat.vue';
import KbFooter from 'components/KbFooter.vue';

const uiStore = useUiStore();
const authStore = useAuthStore();
const messageStore = useMessageStore();

defineOptions({
  name: 'KbIndex',
});

const scrollPlaceholderRef = ref<HTMLDivElement | null>(null);

onMounted(async () => {
  await authStore.setToken();
  messageStore.scrollPlaceholderRef = scrollPlaceholderRef.value;
});
</script>
