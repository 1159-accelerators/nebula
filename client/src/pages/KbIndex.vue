<template>
  <q-page class="row items-end justify-evenly kb-page">
    <div class="kb-container">
      <template v-for="(message, index) in messageStore.messages" :key="index">
        <q-chat-message
          name="Me"
          :text="[message.text]"
          sent
          bg-color="white"
          text-color="gunmetal"
          v-if="message.sender === 'me'"
        />
        <q-chat-message
          name="11:59 Assistant"
          :text="[message.text]"
          bg-color="primary"
          text-color="white"
          v-else
        />
      </template>
      <q-chat-message
        name="11:59 Assistant"
        bg-color="primary"
        text-color="white"
        v-if="uiStore.waiting"
        ><q-spinner-dots size="2rem"></q-spinner-dots
      ></q-chat-message>
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
