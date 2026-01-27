// Twitch OAuth Configuration
const TWITCH_CONFIG = {
    clientId: 'ilf1p5tr7eydtaw36dje0q1a78e1cf', // سيتم توفير تعليمات للحصول عليه
    redirectUri: window.location.origin + window.location.pathname,
    scopes: ['chat:read', 'chat:edit']
};

// Normalize Arabic text for better matching
function normalizeArabic(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .trim()
        // Normalize Alef variations
        .replace(/[أإآا]/g, 'ا')
        // Normalize Taa Marbuta and Haa
        .replace(/[ةه]/g, 'ه')
        // Normalize Yaa variations
        .replace(/[يى]/g, 'ي')
        // Remove Tatweel
        .replace(/ـ/g, '')
        // Remove diacritics (Tashkeel)
        .replace(/[\u064B-\u065F]/g, '')
        // Remove extra spaces
        .replace(/\s+/g, ' ');
}

// Game State
let gameState = {
    channel: '',
    client: null,
    isConnected: false,
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
const setupGuide = document.getElementById('setupGuide');
const loginSection = document.getElementById('loginSection');
const clientIdInput = document.getElementById('clientIdInput');
const saveClientIdBtn = document.getElementById('saveClientIdBtn');
const twitchLoginBtn = document.getElementById('twitchLoginBtn');
const resetClientIdBtn = document.getElementById('resetClientIdBtn');
const redirectUrl = document.getElementById('redirectUrl');

// Floating Secret Box Elements
const secretToggle = document.getElementById('secretToggle');
const secretContent = document.getElementById('secretContent');
const secretAnswersFloat = document.querySelector('.secret-answers-float');
const answersListFloat = document.getElementById('answersListFloat');
const addAnswerFloatBtn = document.getElementById('addAnswerFloatBtn');

// Toggle secret box
secretToggle.addEventListener('click', () => {
    secretAnswersFloat.classList.toggle('collapsed');
    secretToggle.textContent = secretAnswersFloat.classList.contains('collapsed') ? '+' : '−';
});

// Add answer in floating box
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
// OAuth Setup
// ============================================

// Display redirect URL
if (redirectUrl) {
    redirectUrl.textContent = TWITCH_CONFIG.redirectUri;
}

// Copy redirect URL function
window.copyRedirectUrl = function() {
    navigator.clipboard.writeText(TWITCH_CONFIG.redirectUri).then(() => {
        alert('تم نسخ الرابط!');
    });
};

// Check if Client ID is saved
if (TWITCH_CONFIG.clientId) {
    setupGuide.classList.add('hidden');
    loginSection.classList.remove('hidden');
} else {
    setupGuide.classList.remove('hidden');
    loginSection.classList.add('hidden');
}

// Save Client ID
saveClientIdBtn.addEventListener('click', () => {
    const clientId = clientIdInput.value.trim();
    if (!clientId) {
        alert('الرجاء إدخال Client ID');
        return;
    }
    
    localStorage.setItem('twitch_client_id', clientId);
    TWITCH_CONFIG.clientId = clientId;
    
    setupGuide.classList.add('hidden');
    loginSection.classList.remove('hidden');
    
    console.log('Client ID saved:', clientId.substring(0, 8) + '...');
});

// Reset Client ID
resetClientIdBtn.addEventListener('click', () => {
    if (confirm('هل تريد حذف Client ID المحفوظ؟')) {
        localStorage.removeItem('twitch_client_id');
        TWITCH_CONFIG.clientId = '';
        setupGuide.classList.remove('hidden');
        loginSection.classList.add('hidden');
        clientIdInput.value = '';
        console.log('Client ID removed');
    }
});

// Check if elements exist
console.log('Setup elements check:', {
    setupGuide: !!setupGuide,
    loginSection: !!loginSection,
    twitchLoginBtn: !!twitchLoginBtn,
    clientIdSaved: !!TWITCH_CONFIG.clientId
});

// Twitch OAuth Login
twitchLoginBtn.addEventListener('click', () => {
    console.log('Twitch Login button clicked!');
    console.log('Client ID:', TWITCH_CONFIG.clientId);
    
    if (!TWITCH_CONFIG.clientId || TWITCH_CONFIG.clientId === '') {
        alert('⚠️ يجب حفظ Client ID أولاً!\n\nالرجاء:\n1. إنشاء Twitch Application\n2. نسخ Client ID\n3. حفظه في الخانة أعلاه');
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

// Handle OAuth Callback
function handleOAuthCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        // Get user info
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
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Connect using OAuth
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

// Check for OAuth callback on page load
if (window.location.hash.includes('access_token')) {
    handleOAuthCallback();
}

// ============================================
const disconnectBtn = document.getElementById('disconnectBtn');
const connectedChannel = document.getElementById('connectedChannel');
const statusIndicator = document.getElementById('statusIndicator');

const questionText = document.getElementById('questionText');
const gameDuration = document.getElementById('gameDuration');
const answersList = document.getElementById('answersList');
const addAnswerBtn = document.getElementById('addAnswerBtn');
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

});

function updateAnswersUI() {
    const typeSelectors = document.querySelectorAll('.answer-type-float');
    const answerGroups = document.querySelectorAll('.answer-input-group-float');
    
    if (gameState.gameMode === 'colors') {
        // Show all options for colors mode - all selectors visible
        typeSelectors.forEach(sel => {
            sel.style.display = 'block';
            // Reset to default for colors
            if (sel.value !== 'super' && sel.value !== 'match' && sel.value !== 'neutral' && sel.value !== 'avoid' && sel.value !== 'bad') {
                sel.value = 'neutral';
            }
        });
    } else if (gameState.gameMode === 'match') {
        // For match mode: keep only first answer, hide selector, set to match
        typeSelectors.forEach((sel, index) => {
            if (index === 0) {
                sel.style.display = 'none';
                sel.value = 'match';
            } else {
                // Remove extra answers
                answerGroups[index]?.remove();
            }
        });
    } else if (gameState.gameMode === 'avoid') {
        // For avoid mode: keep only first answer, hide selector, set to avoid
        typeSelectors.forEach((sel, index) => {
            if (index === 0) {
                sel.style.display = 'none';
                sel.value = 'avoid';
            } else {
                // Remove extra answers
                answerGroups[index]?.remove();
            }
        });
    }
}

// Add Answer Button
addAnswerBtn.addEventListener('click', () => {
    const answerGroup = document.createElement('div');
    answerGroup.className = 'answer-input-group';
    answerGroup.innerHTML = `
        <input type="text" class="answer-input" placeholder="إجابة إضافية" data-type="neutral">
        <select class="answer-type" ${gameState.gameMode !== 'colors' ? 'style="display:none"' : ''}>
            <option value="match">أخضر (+1)</option>
            <option value="neutral" selected>أصفر (0)</option>
            <option value="avoid">أحمر (-1)</option>
        </select>
        <button class="btn-remove-answer">×</button>
    `;
    answersList.appendChild(answerGroup);
    
    answerGroup.querySelector('.btn-remove-answer').addEventListener('click', () => {
        answerGroup.remove();
    });
});

// Initial setup for remove buttons
document.querySelectorAll('.btn-remove-answer').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.answer-input-group').remove();
    });
});

// Connect to Twitch
// Disconnect
disconnectBtn.addEventListener('click', () => {
    if (gameState.client) {
        gameState.client.disconnect();
    }
    handleDisconnect();
});

function handleDisconnect() {
    setupSection.classList.remove('hidden');
    gameSection.classList.add('hidden');
    gameState.isConnected = false;
    gameState.client = null;
    connectBtn.disabled = false;
    connectBtn.textContent = 'اتصال بالقناة';
    
    if (gameState.currentGame) {
        endCurrentGame();
    }
}

// Start Game
startGameBtn.addEventListener('click', () => {
    const question = questionText.value.trim();
    
    if (!question) {
        alert('الرجاء إدخال السؤال');
        return;
    }
    
    // Collect answers from floating box
    const answerInputs = document.querySelectorAll('.answer-input-float');
    const answers = [];
    
    answerInputs.forEach((input, index) => {
        const answer = input.value.trim();
        if (answer) {
            const typeSelect = input.closest('.answer-input-group-float').querySelector('.answer-type-float');
            const type = typeSelect ? typeSelect.value : gameState.gameMode;
            answers.push({
                text: normalizeArabic(answer), // Normalize the answer
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
    
    // Start game
    gameState.currentGame = {
        question: question,
        answers: answers,
        startTime: Date.now()
    };
    
    // UI Updates
    activeQuestion.textContent = question;
    activeGameCard.classList.remove('hidden');
    document.querySelector('.question-setup-card').style.display = 'none';
    resultsCard.classList.add('hidden');
    
    // Send to chat
    gameState.client.say(gameState.channel, `🎮 ${question}`);
    gameState.client.say(gameState.channel, `⏰ ${gameState.timeRemaining} ثانية`);
    
    startTimer();
});

// Timer
function startTimer() {
    const circumference = 2 * Math.PI * 35;
    timerCircle.style.strokeDasharray = circumference;
    
    updateTimerDisplay();
    
    gameState.timer = setInterval(() => {
        gameState.timeRemaining--;
        updateTimerDisplay();
        
        if (gameState.timeRemaining <= 0) {
            endCurrentGame();
        }
    }, 1000);
}

function updateTimerDisplay() {
    timerText.textContent = gameState.timeRemaining;
    const circumference = 2 * Math.PI * 35;
    const duration = parseInt(gameDuration.value);
    const progress = (gameState.timeRemaining / duration) * circumference;
    timerCircle.style.strokeDashoffset = circumference - progress;
}

// Handle Messages
function handleMessage(channel, tags, message, self) {
    if (self) return;
    
    const username = tags['display-name'] || tags.username;
    const messageText = message.trim();
    
    // Handle !توب command
    if (messageText === '!توب' || messageText === '!top') {
        sendLeaderboardToChat();
        return;
    }
    
    // If no active game, ignore
    if (!gameState.currentGame) return;
    
    // Check if already participated
    if (gameState.participants.has(username)) {
        return;
    }
    
    // Normalize and record participation
    const normalizedAnswer = normalizeArabic(messageText);
    gameState.participants.set(username, normalizedAnswer);
    updateParticipantsList();
}

// Send leaderboard to chat
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
        const badge = document.createElement('div');
        badge.className = 'participant-badge';
        badge.textContent = username;
        participantsList.appendChild(badge);
    });
}

// End Game
endGameBtn.addEventListener('click', () => {
    endCurrentGame();
});

function endCurrentGame() {
    if (!gameState.currentGame) return;
    
    clearInterval(gameState.timer);
    
    // Calculate results
    const results = [];
    gameState.participants.forEach((answer, username) => {
        const result = evaluateAnswer(answer);
        results.push({
            username: username,
            answer: answer,
            points: result.points,
            type: result.type
        });
        
        // Update leaderboard
        const currentScore = gameState.leaderboard.get(username) || 0;
        gameState.leaderboard.set(username, currentScore + result.points);
    });
    
    // Display results
    displayResults(results);
    
    // Send to chat
    gameState.client.say(gameState.channel, `━━━━━━━━━━━━━━━━━━━━━━`);
    gameState.client.say(gameState.channel, `⏱️ انتهى الوقت! النتائج:`);
    
    // Display correct answers
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
    
    // Show top 3
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
    // Normalize user answer for comparison
    const normalizedUserAnswer = normalizeArabic(userAnswer);
    
    for (const answer of gameState.answers) {
        const normalizedCorrectAnswer = normalizeArabic(answer.text);
        
        if (normalizedUserAnswer === normalizedCorrectAnswer) {
            // Check answer type
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
    
    // No match found
    if (gameState.gameMode === 'match') {
        return { points: 0, type: 'neutral' };
    } else if (gameState.gameMode === 'avoid') {
        return { points: 1, type: 'correct' };
    } else {
        return { points: 0, type: 'neutral' };
    }
}

function displayResults(results) {
    // Show correct answers
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
    
    correctAnswers.innerHTML = `<strong>الإجابات الصحيحة:</strong><br>${answersText}`;
    
    // Display results list
    resultsList.innerHTML = '';
    results.sort((a, b) => b.points - a.points).forEach(result => {
        const item = document.createElement('div');
        item.className = `result-item ${result.type}`;
        item.innerHTML = `
            <div>
                <span class="result-player">${result.username}</span>
                <span class="result-answer">(${result.answer})</span>
            </div>
            <span class="result-points ${result.points > 0 ? 'positive' : result.points < 0 ? 'negative' : 'zero'}">
                ${result.points > 0 ? '+' : ''}${result.points}
            </span>
        `;
        resultsList.appendChild(item);
    });
    
    resultsCard.classList.remove('hidden');
}

// New Round
newRoundBtn.addEventListener('click', () => {
    resultsCard.classList.add('hidden');
    document.querySelector('.question-setup-card').style.display = 'block';
    questionText.value = '';
    
    // Reset answers
    answersList.innerHTML = `
        <div class="answer-input-group">
            <input type="text" class="answer-input" placeholder="الإجابة الأولى" data-type="neutral">
            <select class="answer-type" ${gameState.gameMode !== 'colors' ? 'style="display:none"' : ''}>
                <option value="match">أخضر (+1)</option>
                <option value="neutral" selected>أصفر (0)</option>
                <option value="avoid">أحمر (-1)</option>
            </select>
            <button class="btn-remove-answer" style="display:none;">×</button>
        </div>
    `;
});

// Leaderboard
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
        item.className = `leaderboard-item rank-${index + 1}`;
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

// Logo upload handler
logoImage.addEventListener('error', () => {
    // If logo fails to load, use a gradient circle as fallback
    logoImage.style.display = 'none';
    logoImage.parentElement.style.background = 'linear-gradient(135deg, #00A8E8, #023E8A)';
});

// Initialize
updateAnswersUI();

// Check for OAuth callback on page load
if (window.location.hash.includes('access_token')) {
    handleOAuthCallback();
}

// End of DOMContentLoaded
});
