<template>
  <q-page class="row items-end justify-evenly kb-page">
    <div class="kb-container">
      <template v-for="(message, index) in messageStore.messages" :key="index">
        <kb-chat
          name="Me"
          :text="message.text"
          sent
          bg-color="primary"
          text-color="white"
          v-if="message.sender === 'me'"
        />
        <kb-chat
          name="11:59 AI"
          :text="message.text"
          bg-color="white"
          text-color="gunmetal"
          :references="message.references"
          v-else
        />
      </template>
      <kb-chat
        name="11:59 AI"
        bg-color="white"
        text-color="gunmetal"
        v-if="uiStore.waiting"
        ><q-spinner-dots size="2rem"></q-spinner-dots
      ></kb-chat>
      <div id="scroll-placeholder" ref="scrollPlaceholderRef"></div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUiStore } from 'stores/ui-store';
import { useAuthStore } from 'src/stores/auth-store';
import { useKbStore } from 'src/stores/kb-store';
import { useMessageStore } from 'src/stores/message-store';
import KbChat from 'src/components/KbChat.vue';

const uiStore = useUiStore();
const authStore = useAuthStore();
const kbStore = useKbStore();
const messageStore = useMessageStore()

defineOptions({
  name: 'KbIndex',
});

const scrollPlaceholderRef = ref<HTMLDivElement | null>(null);

onMounted(async () => {
  await authStore.setToken();
  await kbStore.getDocsInfo();
  await kbStore.getKbInfo();
  messageStore.scrollPlaceholderRef = scrollPlaceholderRef.value
});
</script>
