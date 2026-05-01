<script setup lang="ts">
import { ref } from 'vue'
import ApiKeySetup from './components/ApiKeySetup.vue'
import NoteApp from './components/NoteApp.vue'

const apiKey = ref(localStorage.getItem('vki_api_key') || '')
const baseUrl = ref(localStorage.getItem('vki_base_url') || 'https://bobdong.cn/v1')
const showSetup = ref(!apiKey.value)

const onSaveKey = (key: string, url: string) => {
  apiKey.value = key
  baseUrl.value = url
  localStorage.setItem('vki_api_key', key)
  localStorage.setItem('vki_base_url', url)
  showSetup.value = false
}

const onOpenSettings = () => {
  showSetup.value = true
}
</script>

<template>
  <ApiKeySetup v-if="showSetup" :initial-key="apiKey" :initial-url="baseUrl" @save="onSaveKey" />
  <NoteApp v-else :api-key="apiKey" :base-url="baseUrl" @settings="onOpenSettings" />
</template>
