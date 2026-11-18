/**
 * 选题页：按题型 / 板块筛选、关键词搜索、随机抽题
 * URL: select.html?mode=structured | select.html?mode=math
 */

import { $, escapeHtml, toast } from './utils.js';
import { loadStructuredQuestions, loadMathQuestions } from './data-loader.js';
import { ensureSettingsDialog } from './settings.js';

ensureSettingsDialog();

const mode = new URLSearchParams(location.search).get('mode') === 'math' ? 'math' : 'structured';

const CONFIG = {
  structured: {
    title: '结构化面试 · 选题',
    page: 'structured.html',
    groupOf: (item) => item.type || '其他',
    primary: (item) => item.question || '',
    secondary: (item) => (item.key_points || []).slice(0, 2).join(' · '),
    tags: (item) => item.tags || [],
    load: loadStructuredQuestions
  },
  math: {
    title: '初中数学试讲 · 选题',
    page: 'math.html',
    groupOf: (item) => item.board || '其他',
    primary: (item) => item.title || item.question || '',
    secondary: (item) => [item.grade, item.source, item.topic].filter(Boolean).join(' · '),
    tags: (item) => [item.topic].filter(Boolean),
    load: loadMathQuestions
  }
};

const cfg = CONFIG[mode];
const state = { items: [], group: '全部', keyword: '' };

document.title = `${cfg.title} · 教资面试学习室`;
$('#page-title').textContent = cfg.title;

function stars(level) {
  const value = Math.max(1, Math.min(3, Number(level) || 1));
  return '★'.repeat(value) + '☆'.repeat(3 - value);
}

function filtered() {
  const keyword = state.keyword.trim().toLowerCase();
  return state.items.filter((item) => {
    if (state.group !== '全部' && cfg.groupOf(item) !== state.group) return false;
    if (!keyword) return true;
    const haystack = [item.question, item.title, item.topic, item.type, item.board, ...(item.tags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
}

function renderFilters() {
  const groups = ['全部', ...new Set(state.items.map(cfg.groupOf))];
  $('#filter-bar').innerHTML = groups
    .map((group) => {
      const active = group === state.group;
      const cls = active
        ? 'bg-brand-600 text-white border-brand-600'
        : 'bg-white text-slate-600 border-slate-200';
      return `<button type="button" data-group="${escapeHtml(group)}" class="h-9 rounded-full border px-3 text-xs font-semibold ${cls}">${escapeHtml(group)}</button>`;
    })
    .join('');
}

function renderList() {
  const list = filtered();
  const host = $('#list');
  $('#empty-hint').classList.toggle('hidden', list.length > 0);
  $('#count-text').textContent = `共 ${list.length} 题 · ${state.group}`;

  host.innerHTML = list
    .map((item) => {
      const id = encodeURIComponent(item.id);
      const tags = cfg.tags(item)
        .map((tag) => `<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">${escapeHtml(tag)}</span>`)
        .join('');
      return `
        <a href="${cfg.page}?id=${id}" class="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:scale-[0.995]">
          <div class="flex items-start gap-2">
            <span class="mt-0.5 shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">${escapeHtml(cfg.groupOf(item))}</span>
            <p class="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-slate-900">${escapeHtml(cfg.primary(item))}</p>
            <span class="shrink-0 text-[11px] text-amber-500">${stars(item.difficulty)}</span>
          </div>
          <p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">${escapeHtml(cfg.secondary(item))}</p>
          ${tags ? `<div class="mt-2 flex flex-wrap gap-1.5">${tags}</div>` : ''}
        </a>`;
    })
    .join('');
}

function bindEvents() {
  $('#filter-bar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-group]');
    if (!button) return;
    state.group = button.dataset.group;
    renderFilters();
    renderList();
  });

  $('#search-input').addEventListener('input', (event) => {
    state.keyword = event.target.value;
    renderList();
  });

  $('#btn-random').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) {
      toast('当前筛选下没有题目', { type: 'warning' });
      return;
    }
    const picked = list[Math.floor(Math.random() * list.length)];
    location.href = `${cfg.page}?id=${encodeURIComponent(picked.id)}`;
  });
}

async function init() {
  bindEvents();
  try {
    const data = await cfg.load();
    state.items = Array.isArray(data) ? data : data.items || [];
    if (!state.items.length) throw new Error('题库为空');
    renderFilters();
    renderList();
  } catch (error) {
    $('#count-text').textContent = '题库加载失败';
    $('#empty-hint').classList.remove('hidden');
    $('#empty-hint').textContent = `题库加载失败：${error.message}。请确认已通过本地服务器打开（如 python -m http.server）。`;
    toast('题库加载失败', { type: 'error' });
    console.error('[select] 加载失败', error);
  }
}

init();
