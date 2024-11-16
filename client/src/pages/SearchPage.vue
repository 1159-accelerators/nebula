<template>
  <q-page-container>
    <q-page padding>
      <q-spinner
        color="secondary"
        size="5em"
        :thickness="10"
        class="absolute-center"
        v-if="docStore.searchLoading"
      />
      <div v-else class="row justify-center">
        <div class="col-12 col-md-6">
          <div class="q-pb-md">
            <router-link :to="{ name: 'index' }" class="search-back-link"
              ><q-icon
                name="las la-angle-left"
                size="md"
                color="secondary"
              />Back to Documents</router-link
            >
          </div>
          <q-separator />
          <div
            v-for="result in docStore.searchResults"
            :key="result.id"
            class="q-mb-lg"
          >
            <div class="row items-center">
              <div class="col" style="font-size: 1.6rem; font-weight: 700">
                <router-link
                  :to="{ name: 'searchDoc', params: { id: result.id } }"
                  class="search-name-link"
                  >{{ result.name }}</router-link
                >
              </div>
              <div class="col-2">
                Distance: {{ result.distance.toFixed(2) }}
              </div>
            </div>
            <div>
              {{ result.text }}
            </div>
          </div>
        </div>
      </div>
    </q-page>
  </q-page-container>
  <router-view></router-view>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import { useDocStore } from 'src/stores/doc-store';

const docStore = useDocStore();

defineOptions({
  name: 'DocPage',
});

onUnmounted(() => {
  docStore.searchResults = [];
  docStore.search = '';
  docStore.searchLoading = true;
});
</script>
