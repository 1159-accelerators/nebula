<template>
  <q-header class="bg-secondary text-charcoal">
      <q-toolbar style="height: 100px">
        <q-toolbar-title>
          <q-avatar size="75px">
            <q-img src="/1159-gunmetal-solid.png" />
          </q-avatar>
        </q-toolbar-title>

        <q-btn dense flat round icon="mdi-information" @click="uiStore.toggleRightDrawer()" class="q-mr-md" />
        <q-btn dense flat round icon="mdi-logout-variant" @click="authStore.signOut()" />
      </q-toolbar>
    </q-header>
</template>
<script setup lang="ts">
import { useUiStore } from 'stores/ui-store';
import { useAuthStore } from 'stores/auth-store';

const uiStore = useUiStore()
const authStore = useAuthStore()

defineOptions({
  name: 'KbHeader',
});
</script>
