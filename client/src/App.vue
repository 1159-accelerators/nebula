<template>
  <router-view v-if="authStatus === 'authenticated'" />
  <q-layout view="hHh lpR fFf" v-else>
    <q-page-container>
      <q-page class="flex-center row bg-white">
        <authenticator :hide-sign-up="true">
          <template v-slot:sign-in-header>
            <div class="flex-center row q-pt-lg">
            <img src="~assets/logos/1159-teal-gradient.png" :style="{maxWidth: '60%', height: 'auto'}" />
          </div>
          </template>
        </authenticator> </q-page
      >>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-vue';
import '@aws-amplify/ui-vue/styles.css';
const { authStatus } = toRefs(useAuthenticator());
defineOptions({
  name: 'KbDemo',
});
</script>
