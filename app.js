// Twitch OAuth Configuration
const TWITCH_CONFIG = {
    clientId: 'ilf1p5tr7eydtaw36dje0q1a78e1cf', // سيتم توفير تعليمات للحصول عليه
    redirectUri: window.location.origin + window.location.pathname,
    scopes: ['chat:read', 'chat:edit']
};

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

// DOM Elements
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const twitchLoginBtn = document.getElementById('twitchLoginBtn');
const showManualBtn = document.getElementById('showManualBtn');
const manualForm = document.getElementById('manualForm');
const channelNameInput = document.getElementById('channelName');
const botTokenInput = document.getElementById('botToken');
const connectBtn = document.getElementById('connectBtn');
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

// ============================================
// Twitch OAuth Functions
// ============================================

// Show/Hide Manual Form
showManualBtn.addEventListener('click', () => {
    manualForm.classList.toggle('hidden');
});

// Twitch OAuth Login
twitchLoginBtn.addEventListener('click', () => {
    // Check if Client ID is configured
    if (TWITCH_CONFIG.clientId === 'YOUR_CLIENT_ID_HERE') {
        showClientIdSetupGuide();
        return;
    }
    
    const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
        `client_id=${TWITCH_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(TWITCH_CONFIG.redirectUri)}&` +
        `response_type=token&` +
        `scope=${TWITCH_CONFIG.scopes.join('+')}`;
    
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
            alert('حدث خطأ في تسجيل الدخول. يرجى المحاولة مرة أخرى.');
        });
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Connect using OAuth
async function connectWithOAuth(username, token) {
    try {
        twitchLoginBtn.disabled = true;
        twitchLoginBtn.innerHTML = '<span style="margin-left: 10px;">⏳</span> جاري الاتصال...';
        
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
        twitchLoginBtn.disabled = false;
        twitchLoginBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 10px;">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
            </svg>
            تسجيل الدخول عبر Twitch
        `;
    }
}

// Show setup guide if Client ID not configured
function showClientIdSetupGuide() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 20px; max-width: 600px; text-align: right; direction: rtl;">
            <h2 style="color: #00A8E8; margin-bottom: 20px;">⚙️ إعداد التطبيق لأول مرة</h2>
            <p style="line-height: 1.8; color: #333; margin-bottom: 20px;">
                لاستخدام تسجيل الدخول السريع، تحتاج إلى إنشاء تطبيق Twitch مجاني. اتبع الخطوات التالية:
            </p>
            <ol style="text-align: right; line-height: 2; color: #555;">
                <li>اذهب إلى <a href="https://dev.twitch.tv/console/apps" target="_blank" style="color: #9146FF;">dev.twitch.tv/console/apps</a></li>
                <li>اضغط "Register Your Application"</li>
                <li>املأ البيانات:
                    <ul style="margin-top: 10px;">
                        <li>Name: أنت وحظك</li>
                        <li>OAuth Redirect URLs: <code style="background: #f0f0f0; padding: 2px 8px; border-radius: 4px;">${window.location.origin + window.location.pathname}</code></li>
                        <li>Category: Chat Bot</li>
                    </ul>
                </li>
                <li>احصل على Client ID وضعه في ملف <code>app.js</code></li>
            </ol>
            <p style="background: #E3F4FF; padding: 15px; border-radius: 10px; margin-top: 20px; color: #0077B6;">
                💡 <strong>بديل سريع:</strong> يمكنك استخدام "الطريقة اليدوية" أدناه بدون إعداد!
            </p>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: #00A8E8; color: white; border: none; padding: 12px 30px; 
                           border-radius: 10px; font-size: 16px; cursor: pointer; margin-top: 20px; font-weight: 700;">
                فهمت
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Check for OAuth callback on page load
if (window.location.hash.includes('access_token')) {
    handleOAuthCallback();
}

// ============================================
// Original Connection Functions
// ============================================

const logoImage = document.getElementById('logoImage');

// Mode Selection
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameState.gameMode = btn.dataset.mode;
        updateAnswersUI();
    });
});

function updateAnswersUI() {
    const answersContainer = document.getElementById('answersContainer');
    if (gameState.gameMode === 'colors') {
        answersContainer.style.display = 'block';
    } else {
        answersContainer.style.display = 'block';
        // Clear to single answer for match/avoid modes
        if (answersList.children.length > 1) {
            while (answersList.children.length > 1) {
                answersList.removeChild(answersList.lastChild);
            }
        }
        // Hide type selector for non-color modes
        const typeSelectors = answersList.querySelectorAll('.answer-type');
        typeSelectors.forEach(sel => {
            if (gameState.gameMode === 'colors') {
                sel.style.display = 'block';
            } else {
                sel.style.display = 'none';
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
connectBtn.addEventListener('click', async () => {
    const channel = channelNameInput.value.trim().toLowerCase();
    const token = botTokenInput.value.trim();
    
    if (!channel || !token) {
        alert('الرجاء إدخال اسم القناة والتوكن');
        return;
    }
    
    try {
        connectBtn.disabled = true;
        connectBtn.textContent = 'جاري الاتصال...';
        
        const client = new tmi.Client({
            options: { debug: false },
            identity: {
                username: 'your_bot_username',
                password: token
            },
            channels: [channel]
        });
        
        client.on('message', handleMessage);
        client.on('connected', () => {
            gameState.isConnected = true;
            gameState.channel = channel;
            gameState.client = client;
            
            setupSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            connectedChannel.textContent = channel;
            
            client.say(channel, '🎮 بوت "أنت وحظك" متصل الآن! استعدوا للعب!');
        });
        
        client.on('disconnected', () => {
            gameState.isConnected = false;
            handleDisconnect();
        });
        
        await client.connect();
    } catch (error) {
        console.error('Connection error:', error);
        alert('فشل الاتصال. تحقق من التوكن واسم القناة.');
        connectBtn.disabled = false;
        connectBtn.textContent = 'اتصال بالقناة';
    }
});

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
    
    // Collect answers
    const answerInputs = document.querySelectorAll('.answer-input');
    const answers = [];
    
    answerInputs.forEach((input, index) => {
        const answer = input.value.trim();
        if (answer) {
            const typeSelect = input.closest('.answer-input-group').querySelector('.answer-type');
            const type = gameState.gameMode === 'colors' ? typeSelect.value : gameState.gameMode;
            answers.push({
                text: answer.toLowerCase(),
                type: type
            });
        }
    });
    
    if (answers.length === 0) {
        alert('الرجاء إدخال إجابة واحدة على الأقل');
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
    gameState.client.say(gameState.channel, `━━━━━━━━━━━━━━━━━━━━━━`);
    gameState.client.say(gameState.channel, `🎮 جولة جديدة من "أنت وحظك"!`);
    gameState.client.say(gameState.channel, `❓ السؤال: ${question}`);
    gameState.client.say(gameState.channel, `⏰ لديكم ${gameState.timeRemaining} ثانية للإجابة!`);
    gameState.client.say(gameState.channel, `📝 اكتبوا إجابتكم في الشات الآن!`);
    gameState.client.say(gameState.channel, `━━━━━━━━━━━━━━━━━━━━━━`);
    
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
    if (self || !gameState.currentGame) return;
    
    const username = tags['display-name'] || tags.username;
    const answer = message.trim().toLowerCase();
    
    // Check if already participated
    if (gameState.participants.has(username)) {
        return;
    }
    
    // Record participation
    gameState.participants.set(username, answer);
    updateParticipantsList();
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
        if (a.type === 'match') prefix = '✅';
        else if (a.type === 'avoid') prefix = '❌';
        else prefix = '⚪';
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
    for (const answer of gameState.answers) {
        if (userAnswer === answer.text) {
            if (gameState.gameMode === 'match' || answer.type === 'match') {
                return { points: 1, type: 'correct' };
            } else if (gameState.gameMode === 'avoid' || answer.type === 'avoid') {
                return { points: -1, type: 'incorrect' };
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
        if (a.type === 'match') label = 'أخضر (+1)';
        else if (a.type === 'avoid') label = 'أحمر (-1)';
        else label = 'أصفر (0)';
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
    logoImage.parentElement.style.background = 'linear-gradient(135deg, #FF6B35, #4ECDC4)';
});

// Initialize
updateAnswersUI();
