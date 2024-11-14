<template>
  <q-page-container>
    <q-page padding>
      <q-table
        binary-state-sort
        :pagination="uiStore.pagination"
        rows-per-page-label="Docs per page"
        flat
        :columns="columns"
        :rows="docStore.docs"
        :grid="uiStore.grid"
        card-container-class="q-col-gutter-md"
        table-header-class="text-bold"
        @row-click="
          (_event, row) => $router.push({ name: 'doc', params: { id: row.id } })
        "
        ><template v-slot:top>
          <q-file ref="filePickerRef" multiple v-model="files" style="display: none;" />
          <q-space></q-space>
          <q-btn
            rounded
            unelevated
            icon="las la-file-upload"
            @click="filePickerRef?.pickFiles()"
          />
          <q-btn
            rounded
            unelevated
            icon="las la-expand"
            @click="uiStore.header = false"
            v-if="uiStore.header == true"
          />
          <q-btn
            rounded
            unelevated
            icon="las la-compress"
            @click="uiStore.header = true"
            v-if="uiStore.header == false"
          />
        </template>

        <template v-slot:item="props">
          <div class="col-12 col-sm-6 col-md-4 col-lg-3 col-xl-2">
            <q-card
              v-ripple
              class="cursor-pointer q-hoverable"
              @click="
                $router.push({ name: 'doc', params: { id: props.row.id } })
              "
            >
              <span class="q-focus-helper"></span>
              <q-img
                class="card-thumbnail"
                :src="`https://d2z3ryzikmrs9q.cloudfront.net/thumbnails/${props.row.id}.png`"
                ><div class="text-h6 absolute-bottom">
                  {{ props.row.name }}
                </div>
              </q-img>
              <q-card-section>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Bucket</div>
                  <div class="cola align-right text-weight-bold text-grey-8">
                    {{ props.row.bucket }}
                  </div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Region</div>
                  <div class="cola align-right text-weight-bold text-grey-8">
                    {{ props.row.region }}
                  </div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Size</div>
                  <div class="cola align-right text-weight-bold text-grey-8">
                    {{ formatBytes(props.row.size) }}
                  </div>
                </div>
                <div class="row q-py-sm">
                  <div class="col text-grey-4">Created</div>
                  <div class="cola align-right text-weight-bold text-grey-8">
                    {{ props.row.createdAt }}
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </template></q-table
      >
    </q-page>
  </q-page-container>
  <router-view></router-view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from 'src/stores/auth-store';
import { useDocStore } from 'src/stores/doc-store';
import { useUiStore } from 'src/stores/ui-store';
import { formatBytes } from 'src/utils/bytes';
import { QFile } from 'quasar'

const docStore = useDocStore();
const authStore = useAuthStore();
const uiStore = useUiStore();

const files = ref<File[]>([]);
const filePickerRef = ref<QFile>()

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'name',
    sortable: true,
    align: 'left' as const,
    required: true,
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
  name: 'IndexPage',
});

onMounted(async () => {
  await authStore.setToken();
  await docStore.listDocs();
});
</script>
