<template>
  <authenticator>
    <q-header class="bg-secondary text-charcoal">
      <q-toolbar style="height: 100px">
        <q-toolbar-title>
          <q-avatar size="75px">
            <q-img src="/1159-gunmetal-solid.png" />
          </q-avatar>
        </q-toolbar-title>

        <q-btn dense flat round icon="mdi-information" @click="toggleRightDrawer" class="q-mr-md" />
        <q-btn dense flat round icon="mdi-logout-variant" @click="signOut" />
      </q-toolbar>
    </q-header>
    <q-page class="row items-end justify-evenly kb-page">
      <div class="kb-container">
        <template v-for="(message, index) in messages" :key="index">
          <q-chat-message name="Me" :text="[message.text]" sent bg-color="white" text-color="gunmetal"
            v-if="message.sender === 'me'" />
          <q-chat-message name="11:59 Assistant" :text="[message.text]" bg-color="primary" text-color="white" v-else />
        </template>
        <q-chat-message name="11:59 Assistant" bg-color="primary" text-color="white" v-if="waiting"><q-spinner-dots
            size="2rem"></q-spinner-dots></q-chat-message>
      </div>
    </q-page>
    <q-drawer v-model="rightDrawerOpen" side="right" overlay class="bg-secondary q-pa-md">
      <div class="q-pa-md">
        <q-toolbar class="bg-primary text-white shadow-2">
          <q-toolbar-title>Knowledge Base</q-toolbar-title>
        </q-toolbar>
        <q-list bordered class="bg-white">
          <q-item>
            <q-item-section>
              <q-item-label>NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kb.knowledgeBase.name
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>ID</q-item-label>
              <q-item-label caption lines="1">{{
                kb.knowledgeBase.knowledgeBaseId
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
              <q-item-label caption lines="1">{{ storageType }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>INDEX NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kb.knowledgeBase.storageConfiguration
                .opensearchServerlessConfiguration.vectorIndexName
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>STATUS</q-item-label>
              <q-item-label caption lines="1">{{
                kb.knowledgeBase.status
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
                kb.dataSource.dataSourceConfiguration.type
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>NAME</q-item-label>
              <q-item-label caption lines="1">{{
                kb.dataSource.name
                }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>BUCKET</q-item-label>
              <q-item-label caption lines="1">{{ bucketName }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label>DOCUMENT COUNT</q-item-label>
              <q-item-label caption lines="1">{{ docs.count }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-drawer>
    <q-footer class="row items-center justify-center kb-footer bg-secondary" bordered>
      <div class="kb-container">
        <q-form autofocus>
          <q-input placeholder="Ask me anything..." bg-color="white" filled v-model="input" dark
            class="kb-selected-input" autofocus ref="inputRef">
            <template v-slot:append>
              <q-btn icon="mdi-send" round flat :color="input ? 'primary' : 'charcoal'" @click="addMessage"
                :disable="!input" type="submit" />
            </template>
          </q-input>
        </q-form>
      </div>
    </q-footer>
  </authenticator>
</template>

<script setup lang="ts">
//import { Template } from 'aws-cdk-lib/assertions';
import { ref, computed, toRefs, watch } from 'vue';
import { api } from 'boot/axios';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-vue';
import '@aws-amplify/ui-vue/styles.css';
const { authStatus, signOut } = toRefs(useAuthenticator());
import { fetchAuthSession } from 'aws-amplify/auth';

defineOptions({
  name: 'IndexPage',
});

let idToken: string | undefined

watch(authStatus, async (newAuthStatus) => {
  if (newAuthStatus === 'authenticated') {
    try {
      const session = await fetchAuthSession()
      idToken = session.tokens?.idToken?.toString()
      getKbInfo()
      getDocsInfo()
    } catch(err) {
      console.log(err)
    }
  }
})

const input = ref('');
const sessionId = ref('');
const rightDrawerOpen = ref(false);
const waiting = ref(false);

const docs = ref({
  docs: [],
  count: 0,
});

const kb = ref({
  dataSource: {
    createdAt: '',
    dataDeletionPolicy: '',
    dataSourceConfiguration: {
      s3Configuration: {
        bucketArn: '',
        bucketOwnerAccountId: '',
      },
      type: '',
    },
    dataSourceId: '',
    knowledgeBaseId: '',
    name: '',
    status: '',
    updatedAt: '',
  },
  knowledgeBase: {
    createdAt: '',
    knowledgeBaseArn: '',
    knowledgeBaseConfiguration: {
      type: '',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: '',
      },
    },
    knowledgeBaseId: '',
    name: '',
    roleArn: '',
    status: '',
    updatedAt: '',
    storageConfiguration: {
      type: '',
      opensearchServerlessConfiguration: {
        collectionArn: '',
        fieldMapping: {
          metadataField: '',
          textField: '',
          vectorField: '',
        },
        vectorIndexName: '',
      },
    },
  },
});

const storageType = computed(() => {
  if (
    kb.value.knowledgeBase.storageConfiguration.type === 'OPENSEARCH_SERVERLESS'
  )
    return 'OpenSearch Serverless';
  else return 'Unknown';
});

const bucketName = computed(() => {
  const stringArray =
    kb.value.dataSource.dataSourceConfiguration.s3Configuration.bucketArn.split(
      ':::'
    );
  return stringArray[1];
});

type Message = {
  sender: 'me' | 'aws';
  text: string;
};

const messages = ref<Message[]>([]);

async function addMessage() {
  waiting.value = true
  messages.value.push({ sender: 'me', text: input.value });
  try {
    const response = await api.post('/chat', {question: input.value, sessionId: sessionId.value}, {headers: {'Authorization': `Bearer ${idToken}`}})
    messages.value.push({ sender: 'aws', text: response.data.data.answer });
    sessionId.value = response.data.data.sessionId;
  } catch (err) {
    console.log(err)
  }
  input.value = '';
  waiting.value = false
  await focusInput()
}

const inputRef = ref<HTMLDivElement | null>(null)

async function focusInput ()  {
  if (inputRef.value) {
    inputRef.value.focus();
  }
};


function toggleRightDrawer() {
  rightDrawerOpen.value = !rightDrawerOpen.value;
}

const getDocsInfo = async () => {
  try {
    const response = await api.get('/docs', {headers: {'Authorization': `Bearer ${idToken}`}});
    docs.value = response.data.data;
  } catch (error) {
    console.error(error);
  }
};

const getKbInfo = async () => {
  try {
    const response = await api.get('/kb', {headers: {'Authorization': `Bearer ${idToken}`}});
    kb.value = response.data.data;
  } catch (error) {
    console.error(error);
  }
};
</script>
