// Twitch OAuth Configuration
const TWITCH_CONFIG = {
    clientId: 'h42n8kuvty7h0v2fpnh1td9ke1zguj', // ← ضع Client ID الخاص بك هنا
    redirectUri: window.location.origin + window.location.pathname,
    scopes: ['chat:read', 'chat:edit']
};

// Normalize Arabic text for better matching
function normalizeArabic(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .trim()
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ةه]/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .replace(/ـ/g, '')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ');
}

// Game State
const gameState = {
    isConnected: false,
    client: null,
    channel: '',
    currentGame: null,
    gameMode: 'match',
    answers: [],
    participants: new Map(),
    leaderboard: new Map(),
    timer: null,
    timeRemaining: 30
};

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

// DOM Elements
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const twitchLoginBtn = document.getElementById('twitchLoginBtn');

const secretToggle = document.getElementById('secretToggle');
const secretContent = document.getElementById('secretContent');
const secretAnswersFloat = document.querySelector('.secret-answers-float');
const answersListFloat = document.getElementById('answersListFloat');
const addAnswerFloatBtn = document.getElementById('addAnswerFloatBtn');

const disconnectBtn = document.getElementById('disconnectBtn');
const connectedChannel = document.getElementById('connectedChannel');
const statusIndicator = document.getElementById('statusIndicator');

const questionText = document.getElementById('questionText');
const gameDuration = document.getElementById('gameDuration');
const startGameBtn = document.getElementById('startGameBtn');

const activeGameCard = document.getElementById('activeGameCard');
const activeQuestion = document.getElementById('activeQuestion');
const timerText = document.getElementById('timerText');
const timerCircle = document.getElementById('timerCircle');
const participantCount = document.getElementById('participantCount');
const participantsList = document.getElementById('participantsList');
const endGameBtn = document.getElementById('endGameBtn');

const resultsCard = document.getElementById('resultsCard');
const correctAnswers = document.getElementById('correctAnswers');
const resultsList = document.getElementById('resultsList');
const newRoundBtn = document.getElementById('newRoundBtn');

const leaderboardList = document.getElementById('leaderboardList');
const resetLeaderboardBtn = document.getElementById('resetLeaderboardBtn');

const logoImage = document.getElementById('logoImage');

// ============================================
// OAuth Setup
// ============================================

// OAuth Login Button
twitchLoginBtn.addEventListener('click', () => {
    console.log('Twitch Login button clicked!');
    console.log('Client ID:', TWITCH_CONFIG.clientId);
    
    if (!TWITCH_CONFIG.clientId || TWITCH_CONFIG.clientId === 'ضع_Client_ID_هنا') {
        alert('⚠️ خطأ: Client ID غير مُعرّف!\n\nالرجاء:\n1. افتح ملف app.js\n2. في السطر 3 استبدل "ضع_Client_ID_هنا" بـ Client ID الخاص بك\n3. احفظ الملف وارفعه على GitHub');
        return;
    }
    
    const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
        `client_id=${TWITCH_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(TWITCH_CONFIG.redirectUri)}&` +
        `response_type=token&` +
        `scope=${TWITCH_CONFIG.scopes.join('+')}`;
    
    console.log('Redirecting to:', authUrl);
    window.location.href = authUrl;
});

function handleOAuthCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Client-Id': TWITCH_CONFIG.clientId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.data && data.data[0]) {
                const username = data.data[0].login;
                connectWithOAuth(username, accessToken);
            }
        })
        .catch(error => {
            console.error('Error getting user info:', error);
            alert('حدث خطأ في تسجيل الدخول. تحقق من Client ID أو جرب مرة أخرى.');
        });
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function connectWithOAuth(username, token) {
    try {
        const client = new tmi.Client({
            options: { debug: false },
            identity: {
                username: username,
                password: `oauth:${token}`
            },
            channels: [username]
        });
        
        client.on('message', handleMessage);
        client.on('connected', () => {
            gameState.isConnected = true;
            gameState.channel = username;
            gameState.client = client;
            
            setupSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            connectedChannel.textContent = username;
            
            client.say(username, '🎮 بوت "أنت وحظك" متصل الآن! استعدوا للعب!');
        });
        
        client.on('disconnected', () => {
            gameState.isConnected = false;
            handleDisconnect();
        });
        
        await client.connect();
    } catch (error) {
        console.error('Connection error:', error);
        alert('فشل الاتصال. يرجى المحاولة مرة أخرى.');
    }
}

if (window.location.hash.includes('access_token')) {
    handleOAuthCallback();
}

// ============================================
// Floating Secret Box
// ============================================

secretToggle.addEventListener('click', () => {
    secretAnswersFloat.classList.toggle('collapsed');
    secretToggle.textContent = secretAnswersFloat.classList.contains('collapsed') ? '+' : '−';
});

addAnswerFloatBtn.addEventListener('click', () => {
    const index = answersListFloat.children.length;
    const answerGroup = document.createElement('div');
    answerGroup.className = 'answer-input-group-float';
    answerGroup.innerHTML = `
        <input type="text" class="answer-input-float" placeholder="إجابة" data-index="${index}">
        <select class="answer-type-float">
            <option value="super">💛 (+2)</option>
            <option value="match">🟢 (+1)</option>
            <option value="neutral" selected>🟡 (0)</option>
            <option value="avoid">🔴 (-1)</option>
            <option value="bad">⚫ (-2)</option>
        </select>
    `;
    answersListFloat.appendChild(answerGroup);
});

// ============================================
// Game Mode Selection
// ============================================

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameState.gameMode = btn.dataset.mode;
        updateAnswersUI();
    });
});

function updateAnswersUI() {
    const typeSelectors = document.querySelectorAll('.answer-type-float');
    const answerGroups = document.querySelectorAll('.answer-input-group-float');
    
    if (gameState.gameMode === 'colors') {
        typeSelectors.forEach(sel => {
            sel.style.display = 'block';
        });
    } else if (gameState.gameMode === 'match') {
        typeSelectors.forEach((sel, index) => {
            if (index === 0) {
                sel.style.display = 'none';
                sel.value = 'match';
            } else {
                answerGroups[index]?.remove();
            }
        });
    } else if (gameState.gameMode === 'avoid') {
        typeSelectors.forEach((sel, index) => {
            if (index === 0) {
                sel.style.display = 'none';
                sel.value = 'avoid';
            } else {
                answerGroups[index]?.remove();
            }
        });
    }
}

// ============================================
// Disconnect
// ============================================

disconnectBtn.addEventListener('click', () => {
    if (gameState.client) {
        gameState.client.disconnect();
    }
    handleDisconnect();
});

function handleDisconnect() {
    gameState.isConnected = false;
    gameState.client = null;
    gameState.channel = '';
    
    setupSection.classList.remove('hidden');
    gameSection.classList.add('hidden');
    activeGameCard.classList.add('hidden');
    resultsCard.classList.add('hidden');
}

// ============================================
// Start Game
// ============================================

startGameBtn.addEventListener('click', () => {
    const question = questionText.value.trim();
    
    if (!question) {
        alert('الرجاء إدخال السؤال');
        return;
    }
    
    const answerInputs = document.querySelectorAll('.answer-input-float');
    const answers = [];
    
    answerInputs.forEach((input, index) => {
        const answer = input.value.trim();
        if (answer) {
            const typeSelect = input.closest('.answer-input-group-float').querySelector('.answer-type-float');
            const type = typeSelect ? typeSelect.value : gameState.gameMode;
            answers.push({
                text: normalizeArabic(answer),
                type: type
            });
        }
    });
    
    if (answers.length === 0) {
        alert('الرجاء إدخال إجابة واحدة على الأقل في الصندوق العائم');
        return;
    }
    
    gameState.answers = answers;
    gameState.participants.clear();
    gameState.timeRemaining = parseInt(gameDuration.value);
    
    gameState.currentGame = {
        question: question,
        answers: answers,
        startTime: Date.now()
    };
    
    activeQuestion.textContent = question;
    activeGameCard.classList.remove('hidden');
    document.querySelector('.question-setup-card').style.display = 'none';
    resultsCard.classList.add('hidden');
    
    gameState.client.say(gameState.channel, `🎮 ${question}`);
    gameState.client.say(gameState.channel, `⏰ ${gameState.timeRemaining} ثانية`);
    
    startTimer();
});

function startTimer() {
    const totalTime = gameState.timeRemaining;
    const circumference = 2 * Math.PI * 35;
    
    timerCircle.style.strokeDasharray = circumference;
    
    gameState.timer = setInterval(() => {
        gameState.timeRemaining--;
        timerText.textContent = gameState.timeRemaining;
        
        const progress = gameState.timeRemaining / totalTime;
        const offset = circumference * (1 - progress);
        timerCircle.style.strokeDashoffset = offset;
        
        if (gameState.timeRemaining <= 0) {
            endCurrentGame();
        }
    }, 1000);
}

// ============================================
// Handle Messages
// ============================================

function handleMessage(channel, tags, message, self) {
    if (self) return;
    
    const username = tags['display-name'] || tags.username;
    const messageText = message.trim();
    
    if (messageText === '!توب' || messageText === '!top') {
        sendLeaderboardToChat();
        return;
    }
    
    if (!gameState.currentGame) return;
    
    if (gameState.participants.has(username)) {
        return;
    }
    
    const normalizedAnswer = normalizeArabic(messageText);
    gameState.participants.set(username, normalizedAnswer);
    updateParticipantsList();
}

function sendLeaderboardToChat() {
    if (!gameState.client || !gameState.isConnected) return;
    
    const sorted = Array.from(gameState.leaderboard.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if (sorted.length === 0) {
        gameState.client.say(gameState.channel, '📊 لا توجد نتائج حالياً');
        return;
    }
    
    gameState.client.say(gameState.channel, '👑 ═══ لوحة المتصدرين ═══ 👑');
    
    sorted.forEach(([player, score], index) => {
        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        else medal = `${index + 1}.`;
        
        gameState.client.say(gameState.channel, `${medal} ${player}: ${score} نقطة`);
    });
}

function updateParticipantsList() {
    participantCount.textContent = gameState.participants.size;
    
    participantsList.innerHTML = '';
    gameState.participants.forEach((answer, username) => {
        const badge = document.createElement('span');
        badge.className = 'participant-badge';
        badge.textContent = username;
        participantsList.appendChild(badge);
    });
}

// ============================================
// End Game
// ============================================

endGameBtn.addEventListener('click', () => {
    endCurrentGame();
});

function endCurrentGame() {
    if (!gameState.currentGame) return;
    
    clearInterval(gameState.timer);
    
    const results = [];
    gameState.participants.forEach((answer, username) => {
        const result = evaluateAnswer(answer);
        results.push({
            username: username,
            answer: answer,
            points: result.points,
            type: result.type
        });
        
        const currentScore = gameState.leaderboard.get(username) || 0;
        gameState.leaderboard.set(username, currentScore + result.points);
    });
    
    displayResults(results);
    
    gameState.client.say(gameState.channel, `━━━━━━━━━━━━━━━━━━━━━━`);
    gameState.client.say(gameState.channel, `⏱️ انتهى الوقت! النتائج:`);
    
    const correctAnswersText = gameState.answers.map(a => {
        let prefix = '';
        if (a.type === 'super') prefix = '💛';
        else if (a.type === 'match') prefix = '🟢';
        else if (a.type === 'neutral') prefix = '🟡';
        else if (a.type === 'avoid') prefix = '🔴';
        else if (a.type === 'bad') prefix = '⚫';
        else prefix = '🟡';
        return `${prefix} ${a.text}`;
    }).join(' | ');
    
    gameState.client.say(gameState.channel, `📋 الإجابات: ${correctAnswersText}`);
    
    const sortedResults = results.sort((a, b) => b.points - a.points).slice(0, 3);
    sortedResults.forEach((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || '🏅';
        gameState.client.say(gameState.channel, `${medal} ${r.username}: ${r.points > 0 ? '+' : ''}${r.points} نقطة`);
    });
    
    gameState.client.say(gameState.channel, `━━━━━━━━━━━━━━━━━━━━━━`);
    
    gameState.currentGame = null;
    activeGameCard.classList.add('hidden');
    updateLeaderboard();
}

function evaluateAnswer(userAnswer) {
    const normalizedUserAnswer = normalizeArabic(userAnswer);
    
    for (const answer of gameState.answers) {
        const normalizedCorrectAnswer = normalizeArabic(answer.text);
        
        if (normalizedUserAnswer === normalizedCorrectAnswer) {
            if (answer.type === 'super') {
                return { points: 2, type: 'super' };
            } else if (gameState.gameMode === 'match' || answer.type === 'match') {
                return { points: 1, type: 'correct' };
            } else if (answer.type === 'neutral') {
                return { points: 0, type: 'neutral' };
            } else if (gameState.gameMode === 'avoid' || answer.type === 'avoid') {
                return { points: -1, type: 'incorrect' };
            } else if (answer.type === 'bad') {
                return { points: -2, type: 'bad' };
            } else {
                return { points: 0, type: 'neutral' };
            }
        }
    }
    
    if (gameState.gameMode === 'match') {
        return { points: 0, type: 'neutral' };
    } else if (gameState.gameMode === 'avoid') {
        return { points: 1, type: 'correct' };
    } else {
        return { points: 0, type: 'neutral' };
    }
}

function displayResults(results) {
    const answersText = gameState.answers.map(a => {
        let label = '';
        if (a.type === 'super') label = '💛 ذهبي (+2)';
        else if (a.type === 'match') label = '🟢 أخضر (+1)';
        else if (a.type === 'neutral') label = '🟡 أصفر (0)';
        else if (a.type === 'avoid') label = '🔴 أحمر (-1)';
        else if (a.type === 'bad') label = '⚫ أسود (-2)';
        else label = '🟡 أصفر (0)';
        return `<span style="margin-left: 15px;"><strong>${a.text}</strong> - ${label}</span>`;
    }).join('');
    
    correctAnswers.innerHTML = answersText;
    
    resultsList.innerHTML = '';
    results.forEach(r => {
        const item = document.createElement('div');
        item.className = `result-item ${r.type}`;
        item.innerHTML = `
            <div>
                <span class="result-player">${r.username}</span>
                <span class="result-answer">(${r.answer})</span>
            </div>
            <span class="result-points ${r.points > 0 ? 'positive' : r.points < 0 ? 'negative' : 'zero'}">
                ${r.points > 0 ? '+' : ''}${r.points}
            </span>
        `;
        resultsList.appendChild(item);
    });
    
    resultsCard.classList.remove('hidden');
    document.querySelector('.question-setup-card').style.display = 'block';
}

// ============================================
// Leaderboard
// ============================================

function updateLeaderboard() {
    if (gameState.leaderboard.size === 0) {
        leaderboardList.innerHTML = '<div class="empty-state">لا توجد نتائج بعد</div>';
        return;
    }
    
    const sorted = Array.from(gameState.leaderboard.entries())
        .sort((a, b) => b[1] - a[1]);
    
    leaderboardList.innerHTML = '';
    sorted.forEach(([username, score], index) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item${index === 0 ? ' rank-1' : ''}`;
        item.innerHTML = `
            <span class="leaderboard-rank">#${index + 1}</span>
            <span class="leaderboard-name">${username}</span>
            <span class="leaderboard-score">${score}</span>
        `;
        leaderboardList.appendChild(item);
    });
}

resetLeaderboardBtn.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من إعادة تعيين جميع النقاط؟')) {
        gameState.leaderboard.clear();
        updateLeaderboard();
        
        if (gameState.client && gameState.isConnected) {
            gameState.client.say(gameState.channel, '🔄 تم إعادة تعيين لوحة المتصدرين!');
        }
    }
});

// ============================================
// New Round
// ============================================

newRoundBtn.addEventListener('click', () => {
    resultsCard.classList.add('hidden');
    questionText.value = '';
    document.querySelectorAll('.answer-input-float').forEach((input, index) => {
        if (index === 0) {
            input.value = '';
        } else {
            input.closest('.answer-input-group-float')?.remove();
        }
    });
});

// ============================================
// Logo Handler
// ============================================

logoImage.addEventListener('error', () => {
    logoImage.style.display = 'none';
    logoImage.parentElement.style.background = 'linear-gradient(135deg, #00A8E8, #023E8A)';
});

// ============================================
// Initialize
// ============================================

updateAnswersUI();

});
