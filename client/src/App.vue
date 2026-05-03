<script setup lang="ts">
import { ref } from 'vue'
import { useAuth, SignIn } from '@clerk/vue'
import ApiKeySetup from './components/ApiKeySetup.vue'
import NoteApp from './components/NoteApp.vue'

const { isSignedIn, getToken } = useAuth()

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
  <div v-if="!isSignedIn" class="auth-wall">
    <SignIn />
  </div>
  <template v-else>
    <ApiKeySetup v-if="showSetup" :initial-key="apiKey" :initial-url="baseUrl" @save="onSaveKey" />
    <NoteApp v-else :api-key="apiKey" :base-url="baseUrl" :get-token="getToken" @settings="onOpenSettings" />
  </template>
</template>

<style scoped>
.auth-wall {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1117;
}
</style>
