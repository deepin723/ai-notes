<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ initialKey: string; initialUrl: string }>()
const emit = defineEmits<{ save: [key: string, url: string] }>()

const key = ref(props.initialKey)
const url = ref(props.initialUrl || 'https://bobdong.cn/v1')
const error = ref('')

const onSave = () => {
  if (!key.value.trim()) { error.value = '请输入 API Key'; return }
  error.value = ''
  emit('save', key.value.trim(), url.value.trim() || 'https://bobdong.cn/v1')
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#1A1F2E"/>
            <polygon points="20,7 28.5,12 28.5,22 20,27 11.5,22 11.5,12" fill="none" stroke="#6366F1" stroke-width="1.1" opacity="0.55"/>
            <line x1="20" y1="17" x2="20" y2="7" stroke="#6366F1" stroke-width="1" opacity="0.45"/>
            <line x1="20" y1="17" x2="28.5" y2="22" stroke="#6366F1" stroke-width="1" opacity="0.45"/>
            <line x1="20" y1="17" x2="11.5" y2="22" stroke="#6366F1" stroke-width="1" opacity="0.45"/>
            <circle cx="20" cy="7" r="2.5" fill="#6366F1"/>
            <circle cx="28.5" cy="12" r="2" fill="#818CF8" opacity="0.8"/>
            <circle cx="28.5" cy="22" r="2" fill="#818CF8" opacity="0.8"/>
            <circle cx="20" cy="27" r="2.5" fill="#6366F1"/>
            <circle cx="11.5" cy="22" r="2" fill="#818CF8" opacity="0.8"/>
            <circle cx="11.5" cy="12" r="2" fill="#818CF8" opacity="0.8"/>
            <circle cx="20" cy="17" r="3.5" fill="#6366F1"/>
            <circle cx="20" cy="17" r="1.8" fill="#A5B4FC"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-name">Vki</h1>
          <p class="brand-sub">deepin · 知识图谱</p>
        </div>
      </div>

      <div class="rule" />

      <h2 class="form-title">配置 API Key</h2>
      <p class="form-desc">填入你自己的 API Key，知识编译将使用你的账户额度。<br/>保存后会加密同步至账号，换设备登录后自动还原。</p>

      <div class="field">
        <label>API Key</label>
        <input v-model="key" type="password" placeholder="sk-..." @keyup.enter="onSave" />
      </div>

      <div class="field">
        <label>Base URL <em>（可选）</em></label>
        <input v-model="url" type="text" placeholder="https://bobdong.cn/v1" />
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <button class="btn" @click="onSave">开始使用</button>

      <p class="foot">支持 OpenAI 兼容接口 · 编译模型 gpt5.4</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(ellipse at 50% 0%, #1A1F2E 0%, #0A0D14 60%);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
}

.brand { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
.logo svg { width: 44px; height: 44px; }
.brand-name { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.4px; }
.brand-sub { font-size: 12px; color: var(--text-2); margin-top: 2px; }

.rule { height: 1px; background: var(--border); margin-bottom: 28px; }

.form-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.form-desc { font-size: 13px; color: var(--text-2); line-height: 1.65; margin-bottom: 24px; }

.field { margin-bottom: 16px; }
.field label { display: block; font-size: 12px; color: var(--text-2); margin-bottom: 6px; letter-spacing: 0.3px; text-transform: uppercase; }
.field label em { text-transform: none; font-style: normal; color: var(--text-3); font-size: 11px; }

.field input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 11px 14px;
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field input:focus { border-color: var(--accent); }
.field input::placeholder { color: var(--text-3); }

.err { font-size: 13px; color: #F87171; margin-bottom: 12px; }

.btn {
  width: 100%;
  margin-top: 8px;
  padding: 13px;
  background: linear-gradient(135deg, var(--accent), var(--accent-dk));
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.2px;
  transition: opacity 0.2s, transform 0.1s;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
}
.btn:hover { opacity: 0.88; }
.btn:active { transform: scale(0.98); }

.foot { text-align: center; font-size: 12px; color: var(--text-3); margin-top: 18px; }
</style>
