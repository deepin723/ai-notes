<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth, SignIn } from '@clerk/vue'
import ApiKeySetup from './components/ApiKeySetup.vue'
import NoteApp from './components/NoteApp.vue'

const { isSignedIn, getToken } = useAuth()

const apiKey = ref(localStorage.getItem('vki_api_key') || '')
const baseUrl = ref(localStorage.getItem('vki_base_url') || 'https://bobdong.cn/v1')
const cursorKey = ref(localStorage.getItem('vki_cursor_key') || '')
const cursorModel = ref(localStorage.getItem('vki_cursor_model') || 'claude-4.7-opus')
const showSetup = ref(!apiKey.value)

// Auto-load settings from server when signed in (cross-device sync)
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
    if (data.cursorKey && !cursorKey.value) {
      cursorKey.value = data.cursorKey
      localStorage.setItem('vki_cursor_key', data.cursorKey)
    }
    if (data.cursorModel && !localStorage.getItem('vki_cursor_model')) {
      cursorModel.value = data.cursorModel
      localStorage.setItem('vki_cursor_model', data.cursorModel)
    }
  } catch {}
}

watch(isSignedIn, (signed) => { if (signed) loadServerSettings() }, { immediate: true })

const onSaveKey = async (payload: { apiKey: string; baseUrl: string; cursorKey: string; cursorModel: string }) => {
  apiKey.value = payload.apiKey
  baseUrl.value = payload.baseUrl
  cursorKey.value = payload.cursorKey
  cursorModel.value = payload.cursorModel
  localStorage.setItem('vki_api_key', payload.apiKey)
  localStorage.setItem('vki_base_url', payload.baseUrl)
  localStorage.setItem('vki_cursor_key', payload.cursorKey)
  localStorage.setItem('vki_cursor_model', payload.cursorModel)
  showSetup.value = false
  // Sync to server so other devices get it automatically
  try {
    const token = await getToken()
    await fetch('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        cursorKey: payload.cursorKey,
        cursorModel: payload.cursorModel,
      }),
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
    <ApiKeySetup
      v-if="showSetup"
      :initial-key="apiKey"
      :initial-url="baseUrl"
      :initial-cursor-key="cursorKey"
      :initial-cursor-model="cursorModel"
      @save="onSaveKey"
    />
    <NoteApp
      v-else
      :api-key="apiKey"
      :base-url="baseUrl"
      :cursor-key="cursorKey"
      :cursor-model="cursorModel"
      :get-token="getToken"
      @settings="onOpenSettings"
    />
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
