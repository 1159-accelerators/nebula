<template>
  <q-footer
    class="row items-center justify-center kb-footer bg-secondary"
    bordered
  >
    <div class="kb-container">
      <q-form autofocus>
        <q-input
          placeholder="Ask me anything..."
          bg-color="white"
          filled
          v-model="messageStore.questionInput"
          dark
          class="kb-selected-input"
          autofocus
          ref="inputRef"
          :disable="uiStore.waiting"
        >
          <template v-slot:append>
            <q-btn
              icon="mdi-send"
              round
              flat
              :color="messageStore.questionInput ? 'primary' : 'charcoal'"
              @click="messageStore.addMessage"
              :disable="!messageStore.questionInput || uiStore.waiting"
              type="submit"
            />
          </template>
        </q-input>
      </q-form>
    </div>
  </q-footer>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUiStore } from 'stores/ui-store';
import { useMessageStore } from 'src/stores/message-store';

defineOptions({
  name: 'KbFooter',
});

const uiStore = useUiStore();
const messageStore = useMessageStore()

const inputRef = ref<HTMLDivElement | null>(null);

onMounted(() => {
  messageStore.questionInputRef = inputRef.value
});
</script>
