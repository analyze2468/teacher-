/**
 * 初中数学试讲页
 * 模块：课题 → 流程与板书 → 计时讲稿 → 评分反馈
 * 评分优先走 AI（已配置且可用），失败或未配置时降级为本机规则评分。
 */

import { $, escapeHtml, countChars, toast, setButtonLoading, beep, scrollToElement } from './utils.js';
import { loadMathQuestions, loadMathOutline, loadStructuredTemplates } from './data-loader.js';
import { resolveMathBoard } from './template-store.js';
import { createCountdown } from './timer.js';
import { localTrialScore, normalizeResult, renderScoreCard } from './scoring.js';
import { isLlmConfigured, scoreTrial } from './llm.js';
import { ensureSettingsDialog } from './settings.js';
import { createRecorder, isRecordingSupported, isSpeechRecognitionSupported } from './recorder.js';
import { saveAttempt, lastPractice } from './storage.js';

ensureSettingsDialog();

const LIMIT_SECONDS = 600;
const state = {
  questions: [],
  boards: [],
  outline: null,
  rubric: null,
  question: null,
  board: null,
  timer: null,
  scoring: false
};

const params = new URLSearchParams(location.search);

function findBoard(item) {
  const base = state.boards.find((board) => board.id === item?.boardId)
    || state.boards.find((board) => board.name === item?.board)
    || state.boards[0]
    || null;
  return base ? resolveMathBoard(base) : null;
}

function renderTopic() {
  const item = state.question;
  if (!item) return;
  $('#m-board').textContent = item.board || '未分类';
  $('#m-title').textContent = item.title || '未命名课题';
  $('#m-meta').textContent = [item.grade, item.source, `难度 ${'★'.repeat(Number(item.difficulty) || 1)}`]
    .filter(Boolean)
    .join(' · ');
  $('#m-question').textContent = item.question || '';

  const fill = (selector, list) => {
    $(selector).innerHTML = (list || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  };
  fill('#m-objectives', item.objectives);
  fill('#m-keypoints', item.keyPoints);
  fill('#m-difficulties', item.difficulties);

  $('#m-detail').classList.add('hidden');
  $('#btn-toggle-detail').textContent = '展开教学目标与重难点';
  document.title = `${item.title || '试讲'} · 教资面试学习室`;
}

function renderBoardTemplate(board) {
  state.board = board;
  if (!board) {
    $('#tpl-summary').textContent = '暂未找到该板块模板。';
    $('#tpl-process').innerHTML = '';
    $('#tpl-board').textContent = '';
    $('#tpl-phrases').innerHTML = '';
    return;
  }

  const template = board.template || {};
  $('#tpl-source').textContent = board.isUser ? '我的模板' : '内置模板';
  $('#tpl-summary').textContent = board.summary || '';

  const steps = (template.process || [])
    .map((line) => `<li class="rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700">${escapeHtml(line)}</li>`)
    .join('');
  const hints = (state.question?.processHint || [])
    .map((line) => `<li class="rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-emerald-900">${escapeHtml(line)}</li>`)
    .join('');
  $('#tpl-process').innerHTML = steps + hints;

  $('#tpl-board').innerHTML = [
    template.board ? `<span class="block">${escapeHtml(template.board)}</span>` : '',
    state.question?.boardPlan ? `<span class="mt-1.5 block text-emerald-800">本题板书：${escapeHtml(state.question.boardPlan)}</span>` : ''
  ].join('');

  $('#tpl-phrases').innerHTML = (template.phrases || [])
    .map((line) => `<li class="rounded-lg bg-brand-50/60 px-2.5 py-1.5 text-slate-700">${escapeHtml(line)}</li>`)
    .join('');
}

function selectQuestion(item) {
  state.question = item;
  renderTopic();
  renderBoardTemplate(findBoard(item));
}

function pickAnother() {
  if (state.questions.length < 2) return state.questions[0] || null;
  const rest = state.questions.filter((item) => item.id !== state.question?.id);
  return rest[Math.floor(Math.random() * rest.length)];
}

async function init() {
  try {
    const [questionData, outlineData, templateData] = await Promise.all([
      loadMathQuestions(),
      loadMathOutline(),
      loadStructuredTemplates()
    ]);
    state.questions = Array.isArray(questionData) ? questionData : questionData.items || [];
    state.outline = outlineData;
    state.boards = Array.isArray(outlineData.boards) ? outlineData.boards : [];
    state.rubric = templateData.rubric?.trial || null;

    if (!state.questions.length) throw new Error('课题库为空');
    if (!state.rubric) throw new Error('缺少试讲评分维度配置');

    const wantedId = params.get('id');
    const matched = state.questions.find((item) => item.id === wantedId);
    selectQuestion(matched || pickAnother());
  } catch (error) {
    $('#m-title').textContent = `课题加载失败：${error.message}`;
    $('#m-board').textContent = '加载失败';
    toast('课题加载失败，请确认已用本地服务器打开', { type: 'error' });
    console.error('[math] 加载失败', error);
  }
}

/* ----------------------------- 录音 ----------------------------- */

let recorder = null;
let recording = false;

function setupRecorder() {
  const button = $('#btn-record');
  if (!button) return;
  if (!isRecordingSupported()) {
    button.disabled = true;
    button.textContent = '当前浏览器不支持录音';
    button.classList.add('opacity-60');
    return;
  }
  recorder = createRecorder({
    maxSeconds: LIMIT_SECONDS,
    onState(next) {
      recording = next === 'recording';
      const labels = {
        idle: '未录音',
        requesting: '请求麦克风…',
        recording: '录音中…',
        stopping: '保存中…',
        stopped: '已录音',
        error: '录音出错'
      };
      $('#rec-state').textContent = labels[next] || '未录音';
      button.textContent = recording ? '■ 停止录音' : '● 开始录音';
      button.disabled = next === 'requesting' || next === 'stopping';
      button.classList.toggle('bg-rose-600', recording);
      button.classList.toggle('text-white', recording);
      button.classList.toggle('bg-rose-50', !recording);
      button.classList.toggle('text-rose-600', !recording);
    },
    onError(error) {
      toast(error?.message || '麦克风不可用，请检查浏览器权限', { type: 'error' });
    }
  });

  button.addEventListener('click', async () => {
    if (recording) {
      await finishRecording();
      return;
    }
    try {
      await recorder.start({ withTranscript: isSpeechRecognitionSupported() });
    } catch (error) {
      console.warn('[math] 录音启动失败', error);
    }
  });
}

async function finishRecording() {
  const result = await recorder?.stop();
  if (!result) return;
  const audio = $('#rec-audio');
  audio.src = result.url;
  audio.classList.remove('hidden');
  const text = String(result.transcript || '').trim();
  if (!text) {
    toast('录音已保存，可回放复盘');
    return;
  }
  const box = $('#notes-input');
  box.value = [box.value.trim(), text].filter(Boolean).join('\n');
  updateCharCount();
  toast('已把语音转写填入讲稿框，可再润色');
}

function setupTimer() {
  state.timer = createCountdown({
    seconds: LIMIT_SECONDS,
    warnAt: 60,
    onTick({ clock, isWarn, isDanger, running }) {
      const clockEl = $('#timer-clock');
      const stickyEl = $('#sticky-clock');
      clockEl.textContent = clock;
      stickyEl.textContent = clock;
      clockEl.classList.toggle('text-rose-600', isDanger);
      clockEl.classList.toggle('text-amber-600', isWarn && !isDanger);
      stickyEl.classList.toggle('text-rose-600', isDanger);
      $('#timer-state').textContent = isDanger ? '时间快到了' : isWarn ? '剩余不足 1 分钟' : running ? '计时中' : '已暂停';
      $('#btn-timer-toggle').textContent = running ? '暂停' : '开始';
    },
    onEnd() {
      $('#timer-state').textContent = '时间到';
      toast('试讲时间到，请收尾并复盘', { type: 'warning' });
      beep(2);
    }
  });
}

function updateCharCount() {
  const text = $('#notes-input').value;
  $('#char-count').textContent = `${countChars(text)} 字`;
}

async function runScore() {
  if (state.scoring) return;
  if (!state.question || !state.rubric) {
    toast('课题尚未加载完成，请稍后再试', { type: 'warning' });
    return;
  }

  const notes = $('#notes-input').value.trim();
  if (countChars(notes) < 40) {
    toast('先记录至少 40 字的试讲要点，再生成评分', { type: 'warning' });
    $('#notes-input').focus();
    return;
  }

  const buttons = [$('#btn-score'), $('#btn-sticky-score')];
  state.scoring = true;
  buttons.forEach((button) => setButtonLoading(button, true, '评分中…'));
  $('#score-status').textContent = '评分中…';

  let result = null;
  let usedAi = false;

  if (isLlmConfigured()) {
    try {
      const raw = await scoreTrial({
        question: state.question,
        notes,
        rubric: state.rubric,
        outline: state.outline
      });
      result = normalizeResult(raw, state.rubric, 'trial');
      result.source = 'ai';
      usedAi = true;
    } catch (error) {
      console.warn('[math] AI 评分失败，降级本机规则', error);
      toast('AI 评分失败，已改用本机规则评分', { type: 'warning' });
    }
  }

  if (!result) {
    try {
      result = localTrialScore({ question: state.question, notes, rubric: state.rubric });
      if (result && !result.dimensions) result = normalizeResult(result, state.rubric, 'trial');
      result.source = 'local';
    } catch (error) {
      console.error('[math] 本机评分失败', error);
      toast('评分失败，请检查题库配置', { type: 'error' });
    }
  }

  buttons.forEach((button) => setButtonLoading(button, false));

  if (!result) {
    $('#score-status').textContent = '评分失败';
    state.scoring = false;
    return;
  }

  const host = $('#score-card');
  host.innerHTML = renderScoreCard(result);
  host.classList.remove('hidden');
  $('#score-status').textContent = usedAi ? 'AI 评分完成' : '本机规则评分（未接入 AI）';
  scrollToElement(host);
  rememberAttempt(result, notes);
  state.scoring = false;
}

function rememberAttempt(result, notes) {
  if (!state.question) return;
  try {
    void saveAttempt({
      mode: 'math',
      questionId: state.question.id,
      title: state.question.title || '',
      excerpt: state.question.board || '',
      answer: notes,
      total: result.total,
      level: result.level,
      source: result.source,
      dimensions: (result.dimensions || []).map((item) => ({
        key: item.key, name: item.name, score: item.score, max: item.max
      }))
    });
    lastPractice.save({
      mode: 'math',
      id: state.question.id,
      title: state.question.title || ''
    });
  } catch (error) {
    console.warn('[math] 记录保存跳过', error);
  }
}

function bindEvents() {
  $('#btn-timer-toggle').addEventListener('click', () => state.timer?.toggle());
  $('#btn-timer-reset').addEventListener('click', () => state.timer?.reset(LIMIT_SECONDS));

  $('#btn-toggle-detail').addEventListener('click', () => {
    const detail = $('#m-detail');
    const willShow = detail.classList.contains('hidden');
    detail.classList.toggle('hidden', !willShow);
    $('#btn-toggle-detail').textContent = willShow ? '收起教学目标与重难点' : '展开教学目标与重难点';
  });

  $('#btn-new-question').addEventListener('click', () => {
    const next = pickAnother();
    if (!next) return;
    $('#notes-input').value = '';
    updateCharCount();
    $('#score-card').classList.add('hidden');
    $('#score-card').innerHTML = '';
    $('#score-status').textContent = '';
    const audio = $('#rec-audio');
    audio.pause();
    audio.removeAttribute('src');
    audio.classList.add('hidden');
    selectQuestion(next);
  });

  $('#notes-input').addEventListener('input', updateCharCount);

  $('#btn-score').addEventListener('click', runScore);
  $('#btn-sticky-score').addEventListener('click', runScore);
}

setupRecorder();
setupTimer();
bindEvents();
init();
