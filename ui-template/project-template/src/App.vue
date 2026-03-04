<script setup>
import { ref } from 'vue'
import logoMark from './assets/logo-mark.svg'
import logoType from './assets/logo.png'

const menuGroups = [
  {
    title: '常用应用',
    items: [
      { id: 'common', label: '常用应用', icon: 'star' },
      { id: 'create', label: '智能创作', icon: 'sparkle' },
      { id: 'resources', label: '备课资源', icon: 'folder' },
    ],
  },
  {
    title: '智能工具',
    items: [
      { id: 'assign', label: '智能命题', icon: 'file' },
      { id: 'review', label: '智能批改', icon: 'check' },
      { id: 'insights', label: '学情洞察', icon: 'chart' },
    ],
  },
]

const cards = [
  {
    id: 'data',
    title: '测评数据管理',
    desc: '集中管理考试数据，支持批量上传、解析与维护',
    tags: ['#数据', '#管理'],
    tone: 'blue',
    icon: 'database',
  },
  {
    id: 'analysis',
    title: '成绩与作业分析',
    desc: '按班级/知识点分析表现，提供教学建议',
    tags: ['#数据分析', '#反馈'],
    tone: 'orange',
    icon: 'trend',
  },
  {
    id: 'profile',
    title: '学生成长档案',
    desc: '学习轨迹与亮点整理，便于面谈与反馈',
    tags: ['#数据', '#反馈'],
    tone: 'purple',
    icon: 'id',
  },
  {
    id: 'stats',
    title: '学生成绩统计',
    desc: '作业提交情况与成绩数据可视化',
    tags: ['#统计', '#数据'],
    tone: 'indigo',
    icon: 'chart',
  },
  {
    id: 'proof',
    title: '成绩证明生成器',
    desc: '生成与打印学生单次或学期的正式成绩证明',
    tags: ['#成绩', '#证明'],
    tone: 'blue',
    icon: 'printer',
  },
]

const navIcons = {
  star: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9L12 3z" />
    </svg>
  `,
  sparkle: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3l1.7 4.1L18 9l-4.3 1.9L12 15l-1.7-4.1L6 9l4.3-1.9L12 3z" />
      <path d="M19 3l.8 2 .2.2 2 .8-2 .8-.2.2-.8 2-.8-2-.2-.2-2-.8 2-.8.2-.2.8-2z" />
    </svg>
  `,
  folder: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M3 7v-1a2 2 0 0 1 2-2h4l2 2" />
    </svg>
  `,
  file: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  `,
  check: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  `,
  chart: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
    </svg>
  `,
}

const cardIcons = {
  database: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  `,
  trend: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M21 7v6h-6" />
    </svg>
  `,
  id: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M13 10h5" />
      <path d="M13 14h5" />
    </svg>
  `,
  chart: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
    </svg>
  `,
  printer: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9V4h12v5" />
      <rect x="6" y="14" width="12" height="6" rx="1" />
      <path d="M6 14H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    </svg>
  `,
}

const toneClasses = {
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}

const currentTab = ref('insights')
const primarySelected = ref(false)
const selectOpen = ref(false)
const selectValue = ref('默认选项')
const selectOptions = ['默认选项', '选项二']
</script>

<template>
  <div class="flex h-screen bg-gradient-to-br from-slate-50 via-[#F8FAFC] to-slate-100 overflow-hidden font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-700">
    <!-- Sidebar -->
    <aside class="w-72 flex flex-col flex-shrink-0 z-30 bg-white/70 backdrop-blur-2xl border-r border-white/40 shadow-[4px_0_30px_-10px_rgba(0,0,0,0.03)] transition-all duration-300">
      <!-- Logo Area -->
      <div class="py-2 px-6 flex flex-row items-center gap-3 relative overflow-hidden group shrink-0">
        <div class="absolute top-0 left-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500 pointer-events-none -translate-x-1/2 -translate-y-1/4"></div>
        <img :src="logoMark" class="w-[66px] h-[66px] object-contain shrink-0 relative z-20" alt="Logo Mark" />
        <div class="flex flex-col items-start gap-2 relative z-20 min-w-0">
          <h1 class="text-[18px] font-bold tracking-tight text-slate-900 leading-none">
            <span class="text-blue-500">R</span>e<span class="text-indigo-500">O</span>pen<span class="text-purple-500">I</span>nno<span class="text-orange-400">L</span>ab
          </h1>
          <img :src="logoType" class="h-8 w-auto object-contain filter invert opacity-90" alt="School Logo" />
        </div>
      </div>

      <!-- Nav Menu -->
      <nav class="flex-1 px-4 space-y-8 py-4 overflow-y-auto custom-scrollbar">
        <div class="relative px-2">
          <input class="w-full px-4 py-2.5 rounded-xl bg-white/70 border border-white/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 text-[13px] text-slate-600 placeholder-slate-400" placeholder="搜索应用" />
          <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">⌘K</span>
        </div>

        <div v-for="group in menuGroups" :key="group.title" class="space-y-2">
          <h3 class="px-2 typo-label-compact text-slate-400">{{ group.title }}</h3>
          <div class="space-y-1">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl typo-button transition-all duration-300 group relative overflow-hidden"
            :class="currentTab === item.id
              ? 'bg-white text-indigo-600 shadow-[0_8px_24px_-12px_rgba(99,102,241,0.4)] ring-1 ring-indigo-100 scale-[1.01]'
              : 'text-slate-500 hover:text-slate-900 hover:bg-white/60 hover:shadow-sm'"
            @click="currentTab = item.id"
          >
            <div
              v-if="currentTab === item.id"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-400 via-purple-400 to-orange-300 rounded-r-full shadow-lg shadow-indigo-100"
            ></div>
            <span
              class="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
              :class="currentTab === item.id ? 'text-indigo-600' : 'text-slate-400'"
            >
              <span v-html="navIcons[item.icon]"></span>
            </span>
            <span
              class="text-[16px] font-medium"
              :class="currentTab === item.id ? 'text-slate-800' : 'text-slate-600'"
            >
              {{ item.label }}
            </span>
          </button>
          </div>
        </div>
      </nav>

      <!-- Sidebar Footer -->
      <div class="p-6 border-t border-slate-100/50 backdrop-blur-sm bg-white/30 flex flex-col gap-3">
        <div class="flex items-center gap-3 p-3 rounded-2xl bg-white/60 border border-white/50 shadow-sm hover:shadow-md hover:bg-white transition-all duration-300 cursor-pointer group">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white typo-button font-black shadow-md ring-2 ring-white">
            A
          </div>
          <div class="flex-1 min-w-0">
            <p class="typo-inline-label text-slate-800 truncate group-hover:text-indigo-600 transition-colors">Alex Chen</p>
            <div class="flex items-center gap-1 mt-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <p class="typo-caption-compact truncate">Pro Member</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 typo-badge">PRO</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button class="flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 bg-white/40 hover:bg-white hover:border-indigo-200 transition-all typo-caption-compact hover:text-indigo-600 group">
            <span class="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364-1.414 1.414M8.05 16.95l-1.414 1.414m0-11.314 1.414 1.414m10.314 10.314 1.414 1.414M12 7a5 5 0 1 1-5 5 5 5 0 0 1 5-5z" />
              </svg>
            </span>
            <span>语言</span>
          </button>
          <button class="flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 bg-white/40 hover:bg-white hover:border-indigo-200 transition-all typo-caption-compact hover:text-indigo-600 group">
            <span class="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9L12 3z" />
              </svg>
            </span>
            <span>收藏</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
      <header class="h-24 flex items-center justify-between px-10 flex-shrink-0">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-sm">
            <span v-html="navIcons.chart"></span>
          </div>
          <div>
            <p class="typo-page-subtitle">5 个相关应用</p>
            <h1 class="typo-page-title text-slate-800">学情洞察</h1>
          </div>
        </div>
      </header>

      <section class="flex-1 px-10 pb-10 overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <article
            v-for="card in cards"
            :key="card.id"
            class="relative bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm hover:shadow-lg transition-all"
          >
            <span class="absolute top-5 right-5 w-2 h-2 rounded-full bg-blue-500/80"></span>
            <div class="flex items-center gap-4 mb-3">
              <div
                class="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm"
                :class="toneClasses[card.tone]"
              >
                <span v-html="cardIcons[card.icon]"></span>
              </div>
              <div class="min-w-0">
                <h3 class="typo-card-title text-slate-900 leading-snug">
                  {{ card.title }}
                </h3>
              </div>
            </div>
            <p class="typo-body text-slate-500 leading-relaxed mb-4">{{ card.desc }}</p>
            <div class="flex gap-4 text-slate-400">
              <span v-for="tag in card.tags" :key="tag" class="typo-caption-compact">{{ tag }}</span>
            </div>
          </article>
        </div>

        <div class="mt-10 space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="typo-section-title">基础元素</h2>
            <span class="typo-caption-compact text-slate-400">与当前项目样式保持一致</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">按钮</h3>
              <div class="space-y-3">
                <button
                  class="w-full py-4 btn-base"
                  :class="primarySelected ? 'btn-primary-selected' : 'btn-primary'"
                  @click="primarySelected = !primarySelected"
                >
                  生成音频
                </button>
              </div>
              <div class="flex flex-wrap gap-3">
                <button class="px-4 py-2 btn-base btn-secondary">
                  Secondary
                </button>
                <button class="px-4 py-2 btn-base btn-ghost">
                  Text
                </button>
                <button class="px-4 py-2 btn-base btn-disabled" disabled>
                  Disabled
                </button>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">输入与选择</h3>
              <div class="space-y-3">
                <input class="w-full px-4 py-3 bg-white border border-slate-200 hover:border-indigo-400 rounded-xl typo-input outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm" placeholder="请输入内容" />
                <input class="w-full px-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl typo-input-mono outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm" placeholder="https://example.com" />
                <div class="relative">
                  <button
                    type="button"
                    class="w-full px-4 pr-11 py-3 bg-white/90 backdrop-blur border border-white/70 hover:border-indigo-300 rounded-2xl typo-input outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-[0_6px_18px_rgba(15,23,42,0.06)] flex items-center justify-between"
                    @click="selectOpen = !selectOpen"
                  >
                    <span class="text-slate-600">{{ selectValue }}</span>
                    <span class="text-slate-400 transition-transform" :class="selectOpen ? 'rotate-180 text-indigo-500' : ''">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>
                  <div
                    v-if="selectOpen"
                    class="absolute z-10 mt-2 w-full bg-white/95 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_12px_30px_rgba(15,23,42,0.12)] overflow-hidden"
                  >
                    <button
                      v-for="option in selectOptions"
                      :key="option"
                      type="button"
                      class="w-full text-left px-4 py-2.5 text-[14px] transition-colors"
                      :class="option === selectValue ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'"
                      @click="selectValue = option; selectOpen = false"
                    >
                      {{ option }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">标签与徽章</h3>
              <div class="flex flex-wrap gap-3 items-center">
                <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full typo-badge">Beta</span>
                <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full typo-badge">Success</span>
                <span class="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full typo-badge">Alert</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full typo-badge">Default</span>
                <span class="px-2 py-0.5 bg-indigo-600/90 text-white rounded-lg shadow-sm typo-badge">ME</span>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">切换与分段</h3>
              <div class="flex items-center gap-3 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <button class="flex-1 py-2 rounded-lg typo-button-compact bg-white text-indigo-600 shadow-sm">Speech</button>
                <button class="flex-1 py-2 rounded-lg typo-button-compact text-slate-500 hover:text-slate-700">Music</button>
                <button class="flex-1 py-2 rounded-lg typo-button-compact text-slate-500 hover:text-slate-700">SFX</button>
              </div>
              <div class="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                <button class="px-4 py-2 rounded-xl typo-button-compact bg-indigo-600 text-white shadow-md">All</button>
                <button class="px-4 py-2 rounded-xl typo-button-compact bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">Portrait</button>
                <button class="px-4 py-2 rounded-xl typo-button-compact bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">Landscape</button>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">卡片样式</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="bg-white/90 border border-white/60 rounded-2xl p-4 shadow-sm">
                  <p class="typo-label-compact mb-1">本周额度</p>
                  <p class="typo-card-title">12 / 30</p>
                </div>
                <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
                  <p class="typo-label-compact text-white/70 mb-1">亮点</p>
                  <p class="typo-card-title text-white">+18%</p>
                </div>
              </div>
            </div>

            <div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm space-y-4">
              <h3 class="typo-section-title">空状态</h3>
              <div class="h-40 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-slate-300">
                <div class="w-12 h-12 rounded-full bg-white shadow-inner flex items-center justify-center mb-3">
                  <span class="icon-md">✨</span>
                </div>
                <p class="typo-empty-title text-slate-300">暂无内容</p>
                <p class="typo-empty-desc">请先创建或导入数据</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
