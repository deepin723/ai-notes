<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth, SignIn } from '@clerk/vue'
import ApiKeySetup from './components/ApiKeySetup.vue'
import NoteApp from './components/NoteApp.vue'
import LabDrawer from './components/LabDrawer.vue'

const OWNER_ID = 'user_3DCBXMtmT0LTnBCs8DtuKN2csFE'
const { isSignedIn, getToken, userId } = useAuth()

const apiKey = ref(localStorage.getItem('vki_api_key') || '')
const baseUrl = ref(localStorage.getItem('vki_base_url') || 'https://bobdong.cn/v1')
const cursorKey = ref(localStorage.getItem('vki_cursor_key') || '')

const VALID_CURSOR_MODELS = new Set([
  'auto', 'composer-2', 'composer-2-fast', 'composer-1.5',
  'gpt-5.2', 'gpt-5.3-codex', 'gpt-5.3-codex-fast',
  'gpt-5.3-codex-low', 'gpt-5.3-codex-low-fast',
  'gpt-5.3-codex-high', 'gpt-5.3-codex-high-fast',
  'gpt-5.3-codex-xhigh', 'gpt-5.3-codex-xhigh-fast',
])
const storedModel = localStorage.getItem('vki_cursor_model') || ''
const cursorModel = ref(VALID_CURSOR_MODELS.has(storedModel) ? storedModel : 'auto')
if (cursorModel.value !== storedModel) localStorage.setItem('vki_cursor_model', cursorModel.value)
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
  <div v-else-if="userId !== OWNER_ID" class="auth-wall auth-denied">
    <span>PRIVATE ACCESS</span>
    <h1>此账号没有访问权限</h1>
    <p>AI Notes 仅供所有者个人学习使用。</p>
  </div>
  <template v-else>
    <LabDrawer />
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
.auth-denied {
  flex-direction: column;
  gap: 12px;
  color: #e2e8f0;
  text-align: center;
}
.auth-denied span { color: #818cf8; font: 800 10px/1 ui-monospace, monospace; letter-spacing: .2em; }
.auth-denied h1 { margin: 0; font-size: 24px; }
.auth-denied p { margin: 0; color: #94a3b8; font-size: 13px; }
</style>
