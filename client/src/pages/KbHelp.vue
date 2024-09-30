<template>
  <q-page-container>
    <q-page class="row justify-evenly kb-info-page">
      <div class="kb-container column q-gutter-md">
        <div class="info-h2">FAQs</div>
        <div class="info-h3">Data</div>
        <div
          v-for="(qa, index) in qas.data"
          :key="index"
          class="row q-col-gutter-sm items-center"
        >
          <div class="col text-bold">{{ qa.question }}</div>
          <div class="caption" v-html="qa.answer"></div>
        </div>
        <div class="info-h3">Models</div>
        <div
          v-for="(qa, index) in qas.model"
          :key="index"
          class="row q-col-gutter-sm items-center"
        >
          <div class="col-12 text-bold">{{ qa.question }}</div>
          <div class="caption col-12" v-html="qa.answer"></div>
        </div>
        <div class="info-h3">Security</div>
        <div
          v-for="(qa, index) in qas.security"
          :key="index"
          class="row q-col-gutter-sm items-center"
        >
          <div class="col-12 text-bold">{{ qa.question }}</div>
          <div class="caption col-12" v-html="qa.answer"></div>
        </div>
        <div class="info-h3">Users</div>
        <div
          v-for="(qa, index) in qas.users"
          :key="index"
          class="row q-col-gutter-sm items-center"
        >
          <div class="col-12 text-bold">{{ qa.question }}</div>
          <div class="caption col-12" v-html="qa.answer"></div>
        </div>
        <div class="info-h2">Common Issues</div>
        <div
          v-for="(issue, index) in issues"
          :key="index"
          class="row q-col-gutter-sm items-center"
        >
          <div class="col-12 text-bold">{{ issue.name }}</div>
          <div class="caption col-12" v-html="issue.resolution"></div>
        </div>
      </div>
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
const qas = {
  model: [
    {
      question: 'Can I adjust the model parameters?',
      answer:
        'Yes, <span class="text-bold">MAX_TOKENS</span>, <span class="text-bold">SOURCE_CHUNKS</span>, <span class="text-bold">TEMPERATURE</span>, and <span class="text-bold">TOP_P</span> are all defined as environmental variables on the NebulaWebApi Lambda function. ' +
        'Just make sure to check the allowed settings for each parameter before modifying',
    },
    {
      question: 'Can I change the model provider after deployment?',
      answer:
        'The foundational conversation model can be swapped, but the embeddings model cannot. ' +
        'To change the foundational model simply adjust the <span class="text-bold">FOUNDATION_MODEL_ARN</span> environmental variable on the NebulaWebApiFunction Lambda function',
    },
    {
      question: 'What if I don\'t see my preferred model in the list?',
      answer:
        'Unfortunately, Bedrock Knowledge bases are currently limited to the models listed in the launch parameters. ' +
        'We will continue to add more as they are made availabel by AWS',
    },
  ],
  data: [
    {
      question: 'How do I add my own data?',
      answer:
        'To add your own data simply upload your documents to the DOCS bucket, and perform a sync operation on the knowledgebase data source. ' +
        'If you followed the default deployment, the bucket will be named <span class="text-bold">nebula-1159-nebuladocsbucket*</span>',
    },
    {
      question: 'How do I perform a sync operation on the knowledgebase?',
      answer:
        'First, navigate to <span class="text-bold">Bedrock</span> in your AWS console, select <span class="text-bold">Knowledge bases</span> from the menu, and locate the knowledge base named <span class="text-bold">nebula-kb</span>. ' +
        'Then select the data source named <span class="text-bold">nebula-source</span> and click <span class="text-bold">Sync</span>',
    },
    {
      question: 'Can I add more data sources to the knowledge base?',
      answer:
        'While there is nothing stopping you from adding additional data sources, this demo application was built for one data source only. ' +
        "You won't be able to propely query or display the additional data source",
    },
    {
      question: 'What sample data is included?',
      answer:
        'If you chose to load the sample data during deployment, you will see three classic novels (<span class="text-bold">Catcher in the Rye</span>, <span class="text-bold">A Tale of Two Cities</span>, and <span class="text-bold">Treasure Island</span>) ' +
        'as well as a brief document containing information on 11:59 personnel',
    },
  ],
  security: [
    {
      question: 'Is any usage data sent to 11:59?',
      answer:
        'No! No usage data whatsoever is exfiltrated from your environment',
    },
    {
      question: 'Are my prompts saved or monitored?',
      answer:
        'Prompts and outputs are not stored anywhere and there is no log of user activity as part of this application',
    },
  ],
  users: [
    {
      question: 'Can I add additional users to the application?',
      answer:
        'Sure, just add them to the Cognito User Pool named <span class="text-bold">NebulaUserPool</span>',
    },
  ],
};

const issues = [
  {
    name: 'Model Access',
    resolution: 'In order to use the embeddings or foundational models, you must request and receive approval using the Bedrock console. ' +
    'Failure to do so will render the application unusable'
  },
  {
    name: 'Invalid Parameters',
    resolution: 'Setting any of the model parameters to improper values will cause errors when querying the data. ' +
    'Check the applicable AWS documentation to validate your parameters before adjusting'
  },
  {
    name: 'Service Quotas',
    resolution: 'Each of the models have their own unique service quotas, so, depending on the model chosen, you may run into errors due to over usage.'
  },
  {
    name: 'Additional Support',
    resolution: 'This application is provided "as is", but feel free to open an issue in the Github repo if you\'re stuck.'
  }
]
</script>
