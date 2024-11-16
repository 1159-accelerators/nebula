<template>
  <q-header class="bg-primary text-white">
    <q-toolbar style="height: 85px">
      <q-toolbar-title>
        <a href="https://1159.ai" target="_blank">
          <q-avatar size="75px">
            <q-img src="~assets/logos/1159-white-solid.png" />
          </q-avatar>
        </a>
      </q-toolbar-title>
      <q-btn
        size="lg"
        dense
        flat
        round
        icon="las la-home"
        @click="$router.push({ name: 'index' })"
        class="q-mr-md"
      />
      <q-btn
        dense
        flat
        round
        size="lg"
        icon="las la-file-upload"
        @click="filePickerRef?.pickFiles()"
        class="q-mr-md"
      />
      <q-form @submit="getSearchResults" class="col-2">
        <q-input
          outlined
          placeholder="search..."
          clearable
          dark
          bg-color="white"
          dense
          v-model="docStore.search"
        >
          <template v-slot:append>
            <q-icon
              name="las la-search"
              class="cursor-pointer text-primary"
              @click="getSearchResults"
            ></q-icon>
          </template>
        </q-input>
      </q-form>
      <q-btn-toggle
        rounded
        unelevated
        v-model="uiStore.grid"
        toggle-color="primary"
        color="white"
        text-color="primary"
        :options="[
          { icon: 'las la-table', value: true },
          { icon: 'las la-bars', value: false },
        ]"
        class="q-mx-md grid-toggle"
      />
      <q-btn
        dense
        flat
        round
        size="lg"
        icon="las la-sign-out-alt"
        color="white"
        @click="logoff"
      />
    </q-toolbar>
    <q-file
      ref="filePickerRef"
      multiple
      v-model="files"
      style="display: none"
    />
  </q-header>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { signOut } from 'aws-amplify/auth';
import { useMessageStore } from 'src/stores/message-store';
import { useDocStore } from 'src/stores/doc-store';
import { useUiStore } from 'src/stores/ui-store';
import { useRouter } from 'vue-router';
import { QFile } from 'quasar';

const docStore = useDocStore();
const uiStore = useUiStore();
const messageStore = useMessageStore();

const files = ref<File[]>([]);
const filePickerRef = ref<QFile>();

const router = useRouter();

const logoff = async () => {
  docStore.$reset();
  messageStore.$reset();
  await signOut();
};

const getSearchResults = async () => {
  router.push({ name: 'search' });
  await docStore.getSearchResults();
};

defineOptions({
  name: 'KbHeader',
});
</script>
