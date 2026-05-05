<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth, SignIn } from '@clerk/vue'
import ApiKeySetup from './components/ApiKeySetup.vue'
import NoteApp from './components/NoteApp.vue'

const { isSignedIn, getToken } = useAuth()

const apiKey = ref(localStorage.getItem('vki_api_key') || '')
const baseUrl = ref(localStorage.getItem('vki_base_url') || 'https://bobdong.cn/v1')
const showSetup = ref(!apiKey.value)

// Auto-load API key from server when signed in (cross-device sync)
const loadServerSettings = async () => {
  try {
    const token = await getToken()
    const resp = await fetch('/api/user-settings', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) return
    const data = await resp.json()
    if (data.apiKey && !apiKey.value) {
      apiKey.value = data.apiKey
      baseUrl.value = data.baseUrl || 'https://bobdong.cn/v1'
      localStorage.setItem('vki_api_key', data.apiKey)
      localStorage.setItem('vki_base_url', baseUrl.value)
      showSetup.value = false
    }
  } catch {}
}

watch(isSignedIn, (signed) => { if (signed) loadServerSettings() }, { immediate: true })

const onSaveKey = async (key: string, url: string) => {
  apiKey.value = key
  baseUrl.value = url
  localStorage.setItem('vki_api_key', key)
  localStorage.setItem('vki_base_url', url)
  showSetup.value = false
  // Sync to server so other devices get it automatically
  try {
    const token = await getToken()
    await fetch('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ apiKey: key, baseUrl: url }),
    })
  } catch {}
}

const onOpenSettings = () => { showSetup.value = true }
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
