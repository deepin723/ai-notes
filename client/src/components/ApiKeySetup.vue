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
            <circle cx="20" cy="14" r="4" fill="#6366F1" opacity="0.9"/>
            <circle cx="10" cy="28" r="3" fill="#818CF8" opacity="0.7"/>
            <circle cx="30" cy="28" r="3" fill="#818CF8" opacity="0.7"/>
            <line x1="20" y1="14" x2="10" y2="28" stroke="#6366F1" stroke-width="1.2" opacity="0.5"/>
            <line x1="20" y1="14" x2="30" y2="28" stroke="#6366F1" stroke-width="1.2" opacity="0.5"/>
            <line x1="10" y1="28" x2="30" y2="28" stroke="#818CF8" stroke-width="1" opacity="0.4"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-name">Vki</h1>
          <p class="brand-sub">神经元智能知识库</p>
        </div>
      </div>

      <div class="rule" />

      <h2 class="form-title">配置 API Key</h2>
      <p class="form-desc">填入你自己的 API Key，知识编译将使用你的账户额度。<br/>Key 只存储在本地浏览器，不会上传至任何服务器。</p>

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
