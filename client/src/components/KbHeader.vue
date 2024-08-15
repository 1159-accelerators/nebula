<template>
  <q-header class="bg-secondary text-charcoal">
    <q-toolbar style="height: 85px">
      <q-toolbar-title>
        <a href="https://1159.ai" target="_blank">
          <q-avatar size="75px">
          <q-img src="~assets/logos/1159-gunmetal-solid.png" />
        </q-avatar>
        </a>

      </q-toolbar-title>
      <q-btn dense flat round icon="mdi-chat" @click="$router.push({name: 'index'})" class="q-mr-md" />
      <q-btn dense flat round icon="mdi-help" @click="$router.push({name: 'help'})" class="q-mr-md" />
      <q-btn dense flat round icon="mdi-logout-variant" @click="logoff" />
    </q-toolbar>
  </q-header>
</template>
<script setup lang="ts">
import { signOut } from 'aws-amplify/auth';
import { useAuthStore } from 'src/stores/auth-store';
import { useMessageStore } from 'src/stores/message-store';

const authStore = useAuthStore()
const messageStore = useMessageStore()

const logoff = async () => {
  authStore.$reset()
  messageStore.$reset()
  await signOut()
}

defineOptions({
  name: 'KbHeader',
});
</script>
