// =============================================
// QUIZ MASTER — Complete Quiz Review App
// =============================================

// ============ FILE LIST ============
const FILE_NAMES = [
    "Week01_Quiz01", "Week01_Quiz02",
    "Week02_Quiz01", "Week02_Quiz02", "Week02_Quiz03", "Week02_Quiz04", "Week02_Quiz05",
    "Week03_Quiz01", "Week03_Quiz02",
    "Week04_Quiz01", "Week04_Quiz02",
    "Week05_Quiz01", "Week05_Quiz02", "Week05_Quiz03", "Week05_Quiz04",
    "Week06_Quiz01", "Week06_Quiz02", "Week06_Quiz03",
    "Week07_Quiz01", "Week07_Quiz02", "Week07_Quiz03",
    "Week08_Quiz01"
];

// ============ STATE ============
let allQuizData = {};          // { fileName: [ {question, options:[], answer} ] }
let currentQuiz = [];          // array of question objects for current session
let currentIndex = 0;
let userAnswers = {};          // { index: 'A'|'B'|'C'|'D' }
let quizHistory = [];          // array of past quiz results
let mistakePool = [];          // array of { question, options, answer, fileName, userAnswer }
let instantFeedback = true;
let filesLoaded = false;
let autoAdvanceTimer = null;
let showQuizTranslation = false;

// ============ DOM REFS ============
const $ = (id) => document.getElementById(id);

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    loadAllFiles();
    setupNavigation();
    setupHomeView();
    setupQuizView();
    setupResultsView();
    setupReviewView();
    setupHistoryView();
    setupMobileToggle();
    updateSidebarStats();
});

// ============ FILE LOADING (fetch .txt files) ============
async function loadAllFiles() {
    const promises = FILE_NAMES.map(async (name) => {
        try {
            const resp = await fetch(`${name}.txt`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            allQuizData[name] = parseQuizText(text);
        } catch (e) {
            console.warn(`Could not load ${name}.txt:`, e);
            allQuizData[name] = [];
        }
    });
    await Promise.all(promises);
    filesLoaded = true;
    renderFileList();
}

// ============ PARSER ============
function parseQuizText(text) {
    const questions = [];
    const lines = text.split(/\r?\n/);

    let currentQ = null;
    let hasOptions = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // ---- Vietnamese lines ----
        if (line.startsWith('(VI)')) {
            const viContent = line.substring(4).trim();

            // Vietnamese question: (VI) N) ...
            const viQMatch = viContent.match(/^\d+\)\s+(.+)/);
            if (viQMatch && currentQ) {
                currentQ.questionVI = viQMatch[1];
                continue;
            }

            // Vietnamese option: (VI) A. ...
            const viOptMatch = viContent.match(/^([A-D])\.\s+(.+)/);
            if (viOptMatch && currentQ) {
                if (!currentQ.optionsVI) currentQ.optionsVI = {};
                currentQ.optionsVI[viOptMatch[1]] = viOptMatch[2];
                continue;
            }

            // Skip other Vietnamese lines (answer, etc.)
            continue;
        }

        // ---- English lines ----

        // Question line: starts with "number)"
        const qMatch = line.match(/^(\d+)\)\s+(.+)/);
        if (qMatch) {
            if (currentQ && currentQ.question && currentQ.answer) {
                questions.push(currentQ);
            }
            currentQ = {
                num: parseInt(qMatch[1]),
                question: qMatch[2],
                questionVI: '',
                options: [],
                optionsVI: {},
                answer: null
            };
            hasOptions = false;
            continue;
        }

        // Option line: A. B. C. D.
        const optMatch = line.match(/^([A-D])\.\s+(.+)/);
        if (optMatch && currentQ) {
            hasOptions = true;
            currentQ.options.push({
                letter: optMatch[1],
                text: optMatch[2]
            });
            continue;
        }

        // Answer line (supports both "Answer: X" and "Answers: X, Y")
        const ansMatch = line.match(/^Answers?\:\s*([A-D])/i);
        if (ansMatch && currentQ) {
            currentQ.answer = ansMatch[1].toUpperCase();
            continue;
        }

        // If we have a current question but haven't hit options yet,
        // this line is likely a code block or continuation of the question
        if (currentQ && !hasOptions && !currentQ.answer) {
            currentQ.question += '\n' + line;
        }
    }

    // Push last question
    if (currentQ && currentQ.question && currentQ.answer) {
        questions.push(currentQ);
    }

    return questions;
}

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = $(`view-${viewName}`);
    if (target) {
        target.classList.add('active');
        // Re-render specific views
        if (viewName === 'review') renderReviewView();
        if (viewName === 'history') renderHistoryView();
    }

    // Close mobile sidebar
    $('sidebar').classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
}

// ============ MOBILE TOGGLE ============
function setupMobileToggle() {
    const toggle = $('mobile-toggle');
    const sidebar = $('sidebar');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
}

// ============ HOME VIEW ============
function setupHomeView() {
    $('btn-select-all').addEventListener('click', () => {
        document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = true);
    });

    $('btn-deselect-all').addEventListener('click', () => {
        document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
    });

    $('btn-start-quiz').addEventListener('click', startQuiz);
}

function renderFileList() {
    const container = $('file-list');
    container.innerHTML = '';

    // Group by week
    const weeks = {};
    FILE_NAMES.forEach(name => {
        const weekMatch = name.match(/Week(\d+)/);
        const week = weekMatch ? `Week ${weekMatch[1]}` : 'Other';
        if (!weeks[week]) weeks[week] = [];
        weeks[week].push(name);
    });

    FILE_NAMES.forEach(name => {
        const count = allQuizData[name] ? allQuizData[name].length : 0;
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <input type="checkbox" id="file-${name}" class="file-checkbox" value="${name}" checked>
            <label for="file-${name}">
                <span class="file-check"></span>
                <span class="file-name">${name.replace('_', ' ')}</span>
                <span class="file-badge">${count}q</span>
            </label>
        `;
        container.appendChild(div);
    });
}

// ============ START QUIZ ============
function startQuiz() {
    // Gather selected files
    const selected = [];
    document.querySelectorAll('.file-checkbox:checked').forEach(cb => {
        selected.push(cb.value);
    });

    if (selected.length === 0) {
        showToast('Please select at least one quiz file!', 'warning');
        return;
    }

    // Gather questions from selected files
    let questions = [];
    selected.forEach(fileName => {
        const qs = allQuizData[fileName] || [];
        qs.forEach(q => {
            questions.push({ ...q, fileName });
        });
    });

    if (questions.length === 0) {
        showToast('No questions found in selected files!', 'warning');
        return;
    }

    // Apply mode
    const mode = $('quiz-mode').value;
    instantFeedback = $('show-feedback').value === 'true';

    switch (mode) {
        case 'shuffle':
            questions = shuffleArray(questions);
            break;
        case 'random10':
            questions = shuffleArray(questions).slice(0, 10);
            break;
        case 'random20':
            questions = shuffleArray(questions).slice(0, 20);
            break;
        case 'random30':
            questions = shuffleArray(questions).slice(0, 30);
            break;
        case 'all':
        default:
            break;
    }

    currentQuiz = questions;
    currentIndex = 0;
    userAnswers = {};

    switchView('quiz');
    renderQuestion();
}

// ============ QUIZ VIEW ============
function setupQuizView() {
    $('btn-next').addEventListener('click', nextQuestion);
    $('btn-prev').addEventListener('click', prevQuestion);
    $('btn-finish').addEventListener('click', finishQuiz);
    $('btn-quit-quiz').addEventListener('click', () => {
        if (confirm('Are you sure you want to quit this quiz?')) {
            switchView('home');
        }
    });
    $('btn-translate-toggle-quiz').addEventListener('click', () => {
        showQuizTranslation = !showQuizTranslation;
        renderQuestion();
    });
}

function renderQuestion() {
    const q = currentQuiz[currentIndex];
    const total = currentQuiz.length;

    // Counter and progress
    $('quiz-counter').textContent = `${currentIndex + 1} / ${total}`;
    $('quiz-file-label').textContent = q.fileName.replace('_', ' ');
    $('quiz-progress-bar').style.width = `${((currentIndex + 1) / total) * 100}%`;

    // Question
    $('question-number').textContent = `Q${currentIndex + 1}`;
    
    // Choose displayed question text (toggled between English and Vietnamese)
    let displayQuestion = q.question;
    if (showQuizTranslation && q.questionVI) {
        displayQuestion = q.questionVI;
    }
    
    // Use innerHTML with escaped HTML and preserve newlines for code blocks
    const escapedQ = displayQuestion
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    $('question-text').innerHTML = escapedQ;

    // Update Translation Toggle Button
    const toggleBtn = $('btn-translate-toggle-quiz');
    if (q.questionVI) {
        toggleBtn.classList.remove('hidden');
        if (showQuizTranslation) {
            toggleBtn.classList.add('active');
            toggleBtn.textContent = '🇬🇧 Xem bản gốc';
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '🇻🇳 Dịch sang tiếng Việt';
        }
    } else {
        toggleBtn.classList.add('hidden');
    }

    // Options
    const optList = $('options-list');
    optList.innerHTML = '';

    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.letter = opt.letter;

        const userAns = userAnswers[currentIndex];
        const isSelected = userAns === opt.letter;
        const wasAnswered = userAns !== undefined;
        const isCorrect = opt.letter === q.answer;

        if (instantFeedback && wasAnswered) {
            btn.classList.add('disabled');
            if (isSelected && isCorrect) btn.classList.add('correct');
            else if (isSelected && !isCorrect) btn.classList.add('wrong');
            else if (isCorrect) btn.classList.add('correct');
        } else if (isSelected) {
            btn.classList.add('selected');
        }

        // Choose option text (toggled between English and Vietnamese)
        const viText = (q.optionsVI && q.optionsVI[opt.letter]) || '';
        const displayOptText = (showQuizTranslation && viText) ? viText : opt.text;

        btn.innerHTML = `
            <span class="option-letter">${opt.letter}</span>
            <span class="option-text">${displayOptText}</span>
        `;

        if (!(instantFeedback && wasAnswered)) {
            btn.addEventListener('click', () => selectOption(opt.letter));
        }

        optList.appendChild(btn);
    });

    // Feedback
    const feedbackBox = $('feedback-box');
    const explanationBox = $('explanation-box');
    const btnTranslate = $('btn-translate');
    const translationPanel = $('translation-panel');
    const userAns = userAnswers[currentIndex];

    if (instantFeedback && userAns !== undefined) {
        const isCorrect = userAns === q.answer;
        feedbackBox.classList.remove('hidden', 'correct-feedback', 'wrong-feedback');
        feedbackBox.classList.add(isCorrect ? 'correct-feedback' : 'wrong-feedback');
        $('feedback-icon').textContent = isCorrect ? '✅' : '❌';
        $('feedback-text').textContent = isCorrect
            ? 'Correct! Well done!'
            : `Wrong! The correct answer is ${q.answer}.`;

        // --- Explanation for wrong answers ---
        if (!isCorrect) {
            explanationBox.classList.remove('hidden');
            const correctOpt = q.options.find(o => o.letter === q.answer);
            const wrongOpt = q.options.find(o => o.letter === userAns);
            let explainHTML = '';
            explainHTML += `<div class="explain-correct">`;
            explainHTML += `<strong>✅ Đáp án đúng: ${q.answer}.</strong> ${correctOpt ? correctOpt.text : ''}`;
            explainHTML += `</div>`;
            explainHTML += `<div class="explain-wrong">`;
            explainHTML += `<strong>❌ Bạn chọn: ${userAns}.</strong> ${wrongOpt ? wrongOpt.text : ''}`;
            explainHTML += `</div>`;
            explainHTML += `<div class="explain-reason">`;
            explainHTML += generateExplanation(q, userAns);
            explainHTML += `</div>`;
            $('explanation-content').innerHTML = explainHTML;
        } else {
            explanationBox.classList.add('hidden');
        }

        // --- Translate button ---
        btnTranslate.classList.remove('hidden');
        // Reset translation panel state
        translationPanel.classList.add('hidden');
        btnTranslate.textContent = '🇻🇳 Xem bản dịch tiếng Việt';
        // Remove old listener and add new one
        const newBtn = btnTranslate.cloneNode(true);
        btnTranslate.parentNode.replaceChild(newBtn, btnTranslate);
        newBtn.addEventListener('click', () => {
            const panel = $('translation-panel');
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                newBtn.textContent = '🇻🇳 Ẩn bản dịch';
                // Populate Vietnamese content
                $('translation-question').textContent = q.questionVI || '(Không có bản dịch)';
                let viOptsHTML = '';
                q.options.forEach(opt => {
                    const viText = (q.optionsVI && q.optionsVI[opt.letter]) || opt.text;
                    const isAnswer = opt.letter === q.answer;
                    viOptsHTML += `<div class="translation-opt ${isAnswer ? 'vi-correct' : ''}">`;
                    viOptsHTML += `<strong>${opt.letter}.</strong> ${viText}`;
                    if (isAnswer) viOptsHTML += ` ✅`;
                    viOptsHTML += `</div>`;
                });
                $('translation-options').innerHTML = viOptsHTML;
            } else {
                panel.classList.add('hidden');
                newBtn.textContent = '🇻🇳 Xem bản dịch tiếng Việt';
            }
        });
    } else {
        feedbackBox.classList.add('hidden');
    }

    // Navigation buttons
    $('btn-prev').disabled = currentIndex === 0;

    if (currentIndex === total - 1) {
        $('btn-next').classList.add('hidden');
        $('btn-finish').classList.remove('hidden');
    } else {
        $('btn-next').classList.remove('hidden');
        $('btn-finish').classList.add('hidden');
    }
}

// ============ EXPLANATION GENERATOR ============
function generateExplanation(q, userAns) {
    const correctOpt = q.options.find(o => o.letter === q.answer);
    const wrongOpt = q.options.find(o => o.letter === userAns);

    if (!correctOpt || !wrongOpt) return '';

    const correctVI = (q.optionsVI && q.optionsVI[q.answer]) ? ` (Tiếng Việt: "${q.optionsVI[q.answer]}")` : '';
    const wrongVI = (q.optionsVI && q.optionsVI[userAns]) ? ` (Tiếng Việt: "${q.optionsVI[userAns]}")` : '';

    // Build a contextual explanation
    let reason = `<p>Đáp án đúng là <strong>${q.answer}</strong>: "${correctOpt.text}"${correctVI}.</p>`;
    reason += `<p>Bạn đã chọn <strong>${userAns}</strong>: "${wrongOpt.text}"${wrongVI} (chưa chính xác trong ngữ cảnh này).</p>`;

    return reason;
}

function selectOption(letter) {
    // Don't re-select if already answered in instant feedback mode
    if (instantFeedback && userAnswers[currentIndex] !== undefined) return;

    userAnswers[currentIndex] = letter;
    renderQuestion();

    // Never auto-advance - user must click Next manually for both correct & incorrect answers
}

function nextQuestion() {
    if (currentIndex < currentQuiz.length - 1) {
        currentIndex++;
        renderQuestion();
        // Scroll quiz card into view
        $('quiz-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
}

// ============ FINISH QUIZ & RESULTS ============
function setupResultsView() {
    $('btn-review-wrong').addEventListener('click', () => {
        $('answers-review').classList.remove('hidden');
        renderAnswersList('wrong');
    });

    $('btn-view-all').addEventListener('click', () => {
        $('answers-review').classList.remove('hidden');
        renderAnswersList('all');
    });

    $('btn-back-home').addEventListener('click', () => switchView('home'));
}

function finishQuiz() {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const wrongQuestions = [];

    currentQuiz.forEach((q, i) => {
        const userAns = userAnswers[i];
        if (!userAns) {
            skipped++;
            wrongQuestions.push({ ...q, userAnswer: null, index: i });
        } else if (userAns === q.answer) {
            correct++;
        } else {
            wrong++;
            wrongQuestions.push({ ...q, userAnswer: userAns, index: i });
        }
    });

    const total = currentQuiz.length;
    const percent = Math.round((correct / total) * 100);

    // Save to history
    const result = {
        date: new Date().toISOString(),
        total,
        correct,
        wrong,
        skipped,
        percent,
        files: [...new Set(currentQuiz.map(q => q.fileName))]
    };
    quizHistory.unshift(result);

    // Save wrong questions to mistake pool
    wrongQuestions.forEach(wq => {
        // Don't duplicate
        const exists = mistakePool.find(m =>
            m.question === wq.question && m.fileName === wq.fileName
        );
        if (!exists) {
            mistakePool.push({
                question: wq.question,
                questionVI: wq.questionVI || '',
                options: wq.options,
                optionsVI: wq.optionsVI || {},
                answer: wq.answer,
                fileName: wq.fileName,
                userAnswer: wq.userAnswer
            });
        }
    });

    saveToStorage();
    updateSidebarStats();

    // Show results view
    switchView('results');
    $('answers-review').classList.add('hidden');

    // Animate results
    $('r-correct').textContent = correct;
    $('r-wrong').textContent = wrong;
    $('r-skipped').textContent = skipped;
    $('results-percent').textContent = `${percent}%`;
    $('results-summary').textContent = `You got ${correct} out of ${total} correct`;

    // Title based on score
    if (percent >= 90) $('results-title').textContent = '🏆 Excellent!';
    else if (percent >= 70) $('results-title').textContent = '👏 Great Job!';
    else if (percent >= 50) $('results-title').textContent = '💪 Keep Practicing!';
    else $('results-title').textContent = '📚 Need More Study';

    // Circle animation
    const circumference = 2 * Math.PI * 54; // r=54
    const offset = circumference - (percent / 100) * circumference;

    // Add SVG gradient definition
    const svg = document.querySelector('.results-circle svg');
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', 'scoreGradient');
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '0%');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', percent >= 70 ? '#059669' : percent >= 50 ? '#d97706' : '#dc2626');

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', percent >= 70 ? '#34d399' : percent >= 50 ? '#fbbf24' : '#f87171');

        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        svg.insertBefore(defs, svg.firstChild);
    }

    const circle = $('circle-fg');
    circle.style.strokeDashoffset = circumference;
    // Trigger animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            circle.style.strokeDashoffset = offset;
        });
    });

    // Update percent color
    const percentEl = $('results-percent');
    if (percent >= 70) percentEl.style.color = '#34d399';
    else if (percent >= 50) percentEl.style.color = '#fbbf24';
    else percentEl.style.color = '#f87171';
}

function renderAnswersList(filter) {
    const container = $('answers-list');
    container.innerHTML = '';

    currentQuiz.forEach((q, i) => {
        const userAns = userAnswers[i];
        const isCorrect = userAns === q.answer;
        const isSkipped = !userAns;

        if (filter === 'wrong' && isCorrect) return;

        const div = document.createElement('div');
        div.className = 'answer-item';
        if (!isCorrect && !isSkipped) div.classList.add('was-wrong');
        if (isSkipped) div.classList.add('was-skipped');

        const ansText = isSkipped ? 'Skipped' : userAns;
        div.innerHTML = `
            <div class="answer-q">Q${i + 1}. ${q.question}</div>
            <div class="answer-meta">
                <span class="your-ans">Your answer: ${ansText}</span>
                <span class="correct-ans">Correct: ${q.answer}</span>
            </div>
        `;
        container.appendChild(div);
    });

    if (container.children.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">🎉 All answers are correct!</p>';
    }
}

// ============ REVIEW MISTAKES VIEW ============
function setupReviewView() {
    $('btn-start-review').addEventListener('click', startReviewQuiz);
    $('btn-clear-mistakes').addEventListener('click', () => {
        if (confirm('Clear all saved mistakes?')) {
            mistakePool = [];
            saveToStorage();
            renderReviewView();
        }
    });
}

function renderReviewView() {
    if (mistakePool.length === 0) {
        $('review-empty').classList.remove('hidden');
        $('review-content').classList.add('hidden');
        return;
    }

    $('review-empty').classList.add('hidden');
    $('review-content').classList.remove('hidden');
    $('review-count').textContent = `${mistakePool.length} question${mistakePool.length > 1 ? 's' : ''}`;

    const container = $('review-list');
    container.innerHTML = '';

    mistakePool.forEach((m, i) => {
        const div = document.createElement('div');
        div.className = 'review-item';
        div.innerHTML = `
            <div class="review-item-q">${i + 1}. ${m.question}</div>
            <div class="review-item-info">
                <span>📁 ${m.fileName.replace('_', ' ')}</span>
                <span class="wrong-label">Your: ${m.userAnswer || 'Skipped'}</span>
                <span class="correct-label">Correct: ${m.answer}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function startReviewQuiz() {
    if (mistakePool.length === 0) return;

    // Create quiz from mistake pool
    currentQuiz = shuffleArray(mistakePool.map(m => ({
        question: m.question,
        questionVI: m.questionVI || '',
        options: m.options,
        optionsVI: m.optionsVI || {},
        answer: m.answer,
        fileName: m.fileName,
        num: 0
    })));

    currentIndex = 0;
    userAnswers = {};
    instantFeedback = true;

    // Clear mistakes since user is reviewing them
    mistakePool = [];
    saveToStorage();

    switchView('quiz');
    renderQuestion();
}

// ============ HISTORY VIEW ============
function setupHistoryView() {
    $('btn-clear-history').addEventListener('click', () => {
        if (confirm('Clear all quiz history?')) {
            quizHistory = [];
            saveToStorage();
            renderHistoryView();
            updateSidebarStats();
        }
    });
}

function renderHistoryView() {
    const container = $('history-list');
    container.innerHTML = '';

    if (quizHistory.length === 0) {
        $('history-empty').classList.remove('hidden');
        $('btn-clear-history').classList.add('hidden');
        return;
    }

    $('history-empty').classList.add('hidden');
    $('btn-clear-history').classList.remove('hidden');

    quizHistory.forEach((h, i) => {
        const div = document.createElement('div');
        div.className = 'history-item';

        const scoreClass = h.percent >= 80 ? 'high' : h.percent >= 50 ? 'mid' : 'low';
        const dateStr = new Date(h.date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        div.innerHTML = `
            <div class="history-score ${scoreClass}">${h.percent}%</div>
            <div class="history-info">
                <h4>${h.files.map(f => f.replace('_', ' ')).join(', ')}</h4>
                <p>${h.correct}/${h.total} correct · ${h.wrong} wrong · ${h.skipped} skipped</p>
            </div>
            <div class="history-date">${dateStr}</div>
        `;
        container.appendChild(div);
    });
}

// ============ SIDEBAR STATS ============
function updateSidebarStats() {
    $('stat-total').textContent = quizHistory.length;

    if (quizHistory.length > 0) {
        const avg = Math.round(
            quizHistory.reduce((sum, h) => sum + h.percent, 0) / quizHistory.length
        );
        $('stat-avg').textContent = `${avg}%`;
    } else {
        $('stat-avg').textContent = '0%';
    }
}

// ============ LOCAL STORAGE ============
function saveToStorage() {
    try {
        localStorage.setItem('qm_history', JSON.stringify(quizHistory));
        localStorage.setItem('qm_mistakes', JSON.stringify(mistakePool));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }
}

function loadFromStorage() {
    try {
        const h = localStorage.getItem('qm_history');
        const m = localStorage.getItem('qm_mistakes');
        if (h) quizHistory = JSON.parse(h);
        if (m) mistakePool = JSON.parse(m);
    } catch (e) {
        console.warn('Could not load from localStorage:', e);
    }
}

// ============ TOAST NOTIFICATION ============
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 14px 24px;
        border-radius: 12px;
        font-family: var(--font);
        font-size: 14px;
        font-weight: 600;
        color: white;
        z-index: 9999;
        animation: toastIn 0.3s ease-out;
        background: ${type === 'warning' ? 'linear-gradient(135deg, #d97706, #fbbf24)' :
            type === 'error' ? 'linear-gradient(135deg, #dc2626, #f87171)' :
            'linear-gradient(135deg, #6366f1, #818cf8)'};
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `;

    document.body.appendChild(toast);

    // Add animation keyframes if not present
    if (!document.querySelector('#toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes toastIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
            @keyframes toastOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(20px); } }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ============ UTILITIES ============
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
    const quizView = $('view-quiz');
    if (!quizView || !quizView.classList.contains('active')) return;

    switch(e.key) {
        case 'ArrowRight':
        case ' ':
            e.preventDefault();
            if (currentIndex < currentQuiz.length - 1) nextQuestion();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (currentIndex > 0) prevQuestion();
            break;
        case 'a': case 'A': case '1':
            selectOption('A');
            break;
        case 'b': case 'B': case '2':
            selectOption('B');
            break;
        case 'c': case 'C': case '3':
            selectOption('C');
            break;
        case 'd': case 'D': case '4':
            selectOption('D');
            break;
        case 'Enter':
            if (currentIndex === currentQuiz.length - 1 && Object.keys(userAnswers).length > 0) {
                finishQuiz();
            }
            break;
    }
});
