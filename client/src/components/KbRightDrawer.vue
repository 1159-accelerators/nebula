<template>
  <q-drawer v-model="uiStore.rightDrawer" side="right" overlay class="bg-secondary q-pa-md">
      <div class="q-pa-md">
        <q-toolbar class="bg-primary text-white shadow-2">
          <q-toolbar-title>Knowledge Base</q-toolbar-title>
        </q-toolbar>
        <q-list bordered class="bg-white">
          <q-item>
            <q-item-section>
              <q-item-label>NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.knowledgeBase.name
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>ID</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.knowledgeBase.knowledgeBaseId
                }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
      <div class="q-pa-md">
        <q-toolbar class="bg-primary text-white shadow-2">
          <q-toolbar-title>Vector Storage</q-toolbar-title>
        </q-toolbar>
        <q-list bordered class="bg-white">
          <q-item>
            <q-item-section>
              <q-item-label>TYPE</q-item-label>
              <q-item-label caption lines="1">{{ kbStore.storageType }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>INDEX NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.knowledgeBase.storageConfiguration
                .opensearchServerlessConfiguration.vectorIndexName
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>STATUS</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.knowledgeBase.status
                }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
      <div class="q-pa-md">
        <q-toolbar class="bg-primary text-white shadow-2">
          <q-toolbar-title>Data Source</q-toolbar-title>
        </q-toolbar>
        <q-list bordered class="bg-white">
          <q-item>
            <q-item-section>
              <q-item-label>TYPE</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.dataSource.dataSourceConfiguration.type
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kbStore.dataSource.name
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>BUCKET</q-item-label>
              <q-item-label caption lines="1">{{ kbStore.bucketName }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>DOCUMENT COUNT</q-item-label>
              <q-item-label caption lines="1">{{ kbStore.bucket.count }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-drawer>
</template>
<script setup lang="ts">
import { useUiStore } from 'stores/ui-store';
import { useKbStore } from 'src/stores/kb-store';

const uiStore = useUiStore()
const kbStore = useKbStore()

defineOptions({
  name: 'KbRightDrawer',
});
</script>
