<template>
  <q-page-container>
    <q-page padding>
      <q-table
        binary-state-sort
        :pagination="pagination"
        rows-per-page-label="Docs per page"
        flat
        :columns="columns"
        :rows="docStore.docs"
        :grid="grid"
        card-container-class="q-col-gutter-md"
        table-header-class="text-bold"
        ><template v-slot:top-right="props">
          <q-btn-toggle
            rounded
            unelevated
            v-model="grid"
            toggle-color="primary"
            :options="[
              { icon: 'mdi-view-grid', value: true },
              { icon: 'mdi-view-headline', value: false },
            ]"
            v-if="!props.inFullscreen"
          />
          <q-btn
            flat
            round
            :icon="
              props.inFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'
            "
            @click="props.toggleFullscreen"
            class="q-ml-md"
            :disable="grid"
          ></q-btn>
        </template>

        <template v-slot:item="props">
          <div class="col-12 col-md-2">
            <q-card>
              <q-img
                class="card-thumbnail"
                :src="`/thumbnails/${props.row.id}.png`"
                ><div class="text-h6 absolute-bottom">
                  {{ props.row.name }}
                </div>
              </q-img>
              <q-card-section>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Bucket</div>
                  <div class="cola align-right text-weight-bold text-grey-8">{{ props.row.bucket }}</div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Region</div>
                  <div class="cola align-right text-weight-bold text-grey-8">{{ props.row.region }}</div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Size</div>
                  <div class="cola align-right text-weight-bold text-grey-8">{{ formatBytes(props.row.size) }}</div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Created</div>
                  <div class="cola align-right text-weight-bold text-grey-8">{{ props.row.createdAt }}</div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </template></q-table
      >
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
//import { useUiStore } from 'stores/ui-store';
import { useAuthStore } from 'src/stores/auth-store';
import { useDocStore } from 'src/stores/doc-store';
import { formatBytes } from 'src/utils/bytes';

const docStore = useDocStore();
//const uiStore = useUiStore();
const authStore = useAuthStore();

const grid = ref(false);

const pagination = {
  sortBy: 'name',
  descending: false,
  rowsPerPage: 25,
};

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'name',
    sortable: true,
    align: 'left' as const,
    required: true,
    headerClasses: 'text-bold'
  },
  {
    name: 'bucket',
    label: 'Bucket',
    field: 'bucket',
    sortable: true,
    align: 'left' as const,
  },
  {
    name: 'region',
    label: 'Region',
    field: 'region',
    sortable: true,
    align: 'left' as const,
  },
  {
    name: 'size',
    label: 'Size',
    field: 'size',
    format: (val: number) => formatBytes(val),
    sortable: true,
  },
  { name: 'createdAt', label: 'Created', field: 'createdAt', sortable: true },
];

defineOptions({
  name: 'KbIndexPage',
});

onMounted(async () => {
  await authStore.setToken();
  await docStore.listDocs();
});
</script>
