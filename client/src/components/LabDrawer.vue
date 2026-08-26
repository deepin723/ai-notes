<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const open = ref(false)
const destinations = [
  { index: '01', label: '实验通行证', note: '返回私人入口', href: 'https://web-production-26425.up.railway.app/', glyph: '⌂' },
  { index: '02', label: '物理实验室', note: '重力、碰撞与刚体', href: 'https://web-production-e6d5fb.up.railway.app/', glyph: '◎' },
  { index: '03', label: '波点音乐室', note: '账户曲库与粒子播放器', href: 'https://web-production-b2221.up.railway.app/', glyph: '♫' },
  { index: '04', label: '装机实验室', note: '真实零件与 3D', href: 'https://web-production-96490.up.railway.app/', glyph: '◇' },
  { index: '05', label: 'AI Notes', note: '当前知识档案', href: 'https://ai-notes-production-68a3.up.railway.app/', glyph: '▤', current: true },
]

const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') open.value = false }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <button class="labs-trigger" aria-label="打开实验导航" :aria-expanded="open" @click="open = true"><span>☰</span> LABS</button>
  <div class="labs-layer" :class="{ open }" :aria-hidden="!open">
    <button class="labs-scrim" aria-label="关闭实验导航" :tabindex="open ? 0 : -1" @click="open = false" />
    <aside class="labs-drawer" aria-label="实验目录">
      <header><div><small>DEEPIN / LABS</small><strong>阅读侧页</strong></div><button aria-label="关闭" @click="open = false">×</button></header>
      <p>合上笔记本，也可以去另一间实验室继续玩。</p>
      <nav>
        <a v-for="item in destinations" :key="item.label" :href="item.href" :class="{ current: item.current }" :aria-current="item.current ? 'page' : undefined">
          <span class="destination-index">{{ item.index }}</span><i>{{ item.glyph }}</i><span><b>{{ item.label }}</b><small>{{ item.note }}</small></span>
        </a>
      </nav>
      <footer><span />PRIVATE LEARNING NETWORK</footer>
    </aside>
  </div>
</template>

<style scoped>
.labs-trigger { position: fixed; z-index: 12000; left: 18px; bottom: 18px; height: 42px; padding: 0 14px; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(129,140,248,.42); border-radius: 22px; background: rgba(15,18,27,.94); color: #c7d2fe; box-shadow: 0 12px 30px rgba(0,0,0,.34); backdrop-filter: blur(14px); cursor: pointer; font: 800 9px/1 ui-monospace, monospace; letter-spacing: .13em; }
.labs-trigger:hover { border-color: #a5b4fc; color: #fff; }
.labs-layer { position: fixed; inset: 0; z-index: 12010; pointer-events: none; }
.labs-layer.open { pointer-events: auto; }
.labs-scrim { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: rgba(5,7,12,.68); opacity: 0; cursor: default; transition: opacity .28s ease; backdrop-filter: blur(3px); }
.labs-layer.open .labs-scrim { opacity: 1; }
.labs-drawer { position: absolute; inset: 0 auto 0 0; width: min(410px, calc(100vw - 28px)); padding: 28px; display: flex; flex-direction: column; color: #e2e8f0; background: #10131d; border-right: 1px solid rgba(129,140,248,.3); box-shadow: 32px 0 80px rgba(0,0,0,.48); transform: translateX(-102%); transition: transform .4s cubic-bezier(.2,.8,.2,1); }
.labs-layer.open .labs-drawer { transform: translateX(0); }
.labs-drawer header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid rgba(148,163,184,.14); }
.labs-drawer header div { display: grid; gap: 7px; }
.labs-drawer header small { color: #a5b4fc; font: 800 9px/1 ui-monospace, monospace; letter-spacing: .2em; }
.labs-drawer header strong { font: 650 28px/1.1 Georgia, 'Noto Serif SC', serif; letter-spacing: -.04em; }
.labs-drawer header button { width: 38px; height: 38px; border: 1px solid rgba(148,163,184,.18); border-radius: 50%; color: #e2e8f0; background: transparent; cursor: pointer; font-size: 24px; }
.labs-drawer > p { margin: 22px 0 28px; color: #8994a8; font-size: 12px; line-height: 1.6; }
.labs-drawer nav { display: grid; }
.labs-drawer nav a { min-height: 72px; padding: 0 13px; display: grid; grid-template-columns: 28px 25px 1fr; align-items: center; gap: 10px; border-top: 1px solid rgba(148,163,184,.13); color: #dce3ee; text-decoration: none; transition: 180ms ease; }
.labs-drawer nav a:last-child { border-bottom: 1px solid rgba(148,163,184,.13); }
.labs-drawer nav a:hover { padding-left: 19px; color: #c7d2fe; background: rgba(129,140,248,.07); }
.labs-drawer nav a.current { color: #111522; background: #a5b4fc; }
.destination-index { color: #64748b; font: 700 8px/1 ui-monospace, monospace; }
.labs-drawer nav a.current .destination-index { color: rgba(17,21,34,.46); }
.labs-drawer nav i { font-style: normal; font-size: 18px; }
.labs-drawer nav a > span:last-child { display: grid; gap: 4px; }
.labs-drawer nav b { font-size: 13px; }
.labs-drawer nav small { color: #778398; font-size: 9px; }
.labs-drawer nav a.current small { color: rgba(17,21,34,.62); }
.labs-drawer footer { margin-top: auto; display: flex; align-items: center; gap: 9px; color: #58647a; font: 700 8px/1 ui-monospace, monospace; letter-spacing: .14em; }
.labs-drawer footer span { width: 6px; height: 6px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; }
</style>
