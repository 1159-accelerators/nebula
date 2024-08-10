<template>
  <q-layout view="hHh lpR fFf" class="bg-secondary">
    <kb-header />
    <q-page-container>
      <router-view />
    </q-page-container>
    <kb-right-drawer />
    <kb-footer />
  </q-layout>
</template>

<script setup>
import KbHeader from 'components/KbHeader.vue';
import KbRightDrawer from 'components/KbRightDrawer.vue';
import KbFooter from 'components/KbFooter.vue';
</script>
