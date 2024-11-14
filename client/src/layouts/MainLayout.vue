<template>
  <q-layout view="hHr lpR fFf">
    <kb-header v-if="uiStore.header"/>
    <router-view />
  </q-layout>
</template>

<script setup>
import { useUiStore } from 'src/stores/ui-store';
import KbHeader from 'components/KbHeader.vue';

const uiStore = useUiStore()
</script>
