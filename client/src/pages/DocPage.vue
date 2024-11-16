<template>
  <q-dialog
    v-model="drawer"
    square
    :full-height="$q.screen.gt.md ? true : false"
    :maximized="$q.screen.lt.lg ? true : false"
    :position="$q.screen.gt.md ? 'right' : undefined"
    backdrop-filter="blur(4px)"
    @update:model-value="goBack"
  >
    <div
      class="bg-white q-pa-md"
      :style="{ width: $q.screen.gt.md ? '50vw' : undefined }"
    >
      <q-spinner
        color="secondary"
        size="5em"
        :thickness="10"
        class="absolute-center"
        v-if="loading"
      />
      <div v-else>
        <q-toolbar>
          <q-toolbar-title class="text-weight-semi" style="font-size: 2rem">{{
            document.name
          }}</q-toolbar-title>
          <q-btn
            flat
            dense
            size="md"
            icon="las la-file-download"
            @click="download"
            class="q-mr-md"
          />
          <q-btn
            flat
            dense
            size="md"
            icon="lar la-window-close"
            @click="$router.push({ name: 'index' })"
          />
        </q-toolbar>
        <q-separator />
        <div class="row q-pa-md q-col-gutter-md full-height">
          <div class="col-12 col-lg-6">
            <q-img
              :src="`https://d2s7juqjnj3wz6.cloudfront.net/thumbnails/${$route.params.id}.png`"
            >
            </q-img>
          </div>
          <div class="col-12 col-lg-6">
            <div style="font-weight: 600; font-size: 1.2rem" class="q-pb-md">
              Summary
            </div>
            <div>{{ document.summary }}</div>
          </div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from 'boot/axios';
import { Document } from 'src/stores/doc-store';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { fetchAuthSession } from '@aws-amplify/auth';
import { downloadHelper } from 'src/utils/files';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();

defineOptions({
  name: 'DocPage',
});

const drawer = true;
const loading = ref(true);

const goBack = () => {
  if (route.name == 'searchDoc') {
    router.push({name: 'search'})
  } else {
    router.push({name: 'index'})
  }
}

const document = ref<Document>({
  id: '',
  region: '',
  bucket: '',
  key: '',
  mime: '',
  ext: '',
  summary: '',
  name: '',
  size: 0,
  createdAt: '',
});

function download() {
  downloadHelper(document.value.bucket, document.value.key)
}

async function getDoc(id: string | string[]) {
  try {
    const session = await fetchAuthSession();
    const response = await api.get(`/docs/${id}`, {
      headers: { Authorization: `Bearer ${session.tokens?.idToken}` },
    });
    loading.value = false;
    document.value = response.data.doc;
    //this.sessionId = response.data.data.sessionId;
  } catch (err) {
    console.log(err);
  }
}

watch(() => route.params.id, getDoc, { immediate: true });
</script>
