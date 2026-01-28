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
        // Remove ال
        .replace(/^ال/, '')
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ةه]/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .replace(/ـ/g, '')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ');
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// Check if two texts are similar (handles typos)
function isSimilarText(text1, text2) {
    const normalized1 = normalizeArabic(text1);
    const normalized2 = normalizeArabic(text2);
    
    if (normalized1 === normalized2) {
        return true;
    }
    
    // Allow 85% similarity for typos
    const distance = levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    const similarity = 1 - (distance / maxLength);
    
    return similarity >= 0.85;
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
const secretAnswersFloat = document.getElementById('secretAnswersFloat');
const answersListFloat = document.getElementById('answersListFloat');
const addAnswerFloatBtn = document.getElementById('addAnswerFloatBtn');

const disconnectBtn = document.getElementById('disconnectBtn');
const connectedChannel = document.getElementById('connectedChannel');

// NEW: Question Input Screen
const questionInputScreen = document.getElementById('questionInputScreen');
const openQuestionScreen = document.getElementById('openQuestionScreen');
const questionTextInput = document.getElementById('questionTextInput');
const gameDurationInput = document.getElementById('gameDurationInput');
const startGameBtnFinal = document.getElementById('startGameBtnFinal');

// Leaderboard Toggle
const leaderboardToggleBtn = document.getElementById('leaderboardToggleBtn');
const leaderboardCard = document.getElementById('leaderboardCard');
const leaderboardList = document.getElementById('leaderboardList');

const activeGameCard = document.getElementById('activeGameCard');
const activeQuestion = document.getElementById('activeQuestion');
const timerText = document.getElementById('timerText');
const timerCircle = document.getElementById('timerCircle');
const participantsList = document.getElementById('participantsList');
const participantsCount = document.getElementById('participantsCount');
const endGameBtn = document.getElementById('endGameBtn');

// NEW: Results Display
const resultsDisplay = document.getElementById('resultsDisplay');
const resultsGrid = document.getElementById('resultsGrid');
const nextRoundBtn = document.getElementById('nextRoundBtn');

// Twitch Login
twitchLoginBtn.addEventListener('click', () => {
    if (!TWITCH_CONFIG.clientId || TWITCH_CONFIG.clientId === 'ضع_Client_ID_هنا') {
        alert('⚠️ خطأ: Client ID غير مُعرّف!\n\nالرجاء:\n1. افتح ملف app.js\n2. في السطر 3 استبدل "ضع_Client_ID_هنا" بـ Client ID الخاص بك');
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
const hash = window.location.hash;
if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        connectToTwitch(accessToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function connectToTwitch(token) {
    fetch('https://api.twitch.tv/helix/users', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Client-Id': TWITCH_CONFIG.clientId
        }
    })
    .then(response => response.json())
    .then(data => {
        const username = data.data[0].login;
        
        const client = new tmi.Client({
            options: { debug: false },
            connection: {
                secure: true,
                reconnect: true
            },
            identity: {
                username: username,
                password: `oauth:${token}`
            },
            channels: [username]
        });
        
        client.connect().then(() => {
            gameState.isConnected = true;
            gameState.client = client;
            gameState.channel = username;
            
            setupSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            connectedChannel.textContent = username;
        });
        
        client.on('message', handleMessage);
    });
}

// Toggle Secret Answers Float
secretToggle.addEventListener('click', () => {
    secretAnswersFloat.classList.toggle('collapsed');
    secretToggle.textContent = secretAnswersFloat.classList.contains('collapsed') ? '+' : '−';
});

// Open Question Screen
openQuestionScreen.addEventListener('click', () => {
    questionInputScreen.classList.remove('hidden');
    leaderboardCard.classList.add('hidden');
});

// Mode Selection in Question Screen
document.querySelectorAll('.mode-btn-large').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn-large').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameState.gameMode = btn.dataset.mode;
    });
});

// Add Answer (Float)
addAnswerFloatBtn.addEventListener('click', () => {
    const answerText = prompt('أدخل الإجابة:');
    if (!answerText) return;
    
    let answerType = 'match';
    
    if (gameState.gameMode === 'colors') {
        const typeChoice = prompt('نوع الإجابة:\n1 = أخضر (+1)\n2 = أصفر (0)\n3 = أحمر (-1)\n4 = ذهبي (+2)\n5 = أسود (-2)');
        
        if (typeChoice === '1') answerType = 'match';
        else if (typeChoice === '2') answerType = 'neutral';
        else if (typeChoice === '3') answerType = 'avoid';
        else if (typeChoice === '4') answerType = 'super';
        else if (typeChoice === '5') answerType = 'bad';
    }
    
    gameState.answers.push({ text: answerText, type: answerType });
    updateAnswersListFloat();
});

function updateAnswersListFloat() {
    if (gameState.answers.length === 0) {
        answersListFloat.innerHTML = '<div class="empty-state-float">لم تضف إجابات بعد</div>';
        return;
    }
    
    answersListFloat.innerHTML = '';
    gameState.answers.forEach((answer, index) => {
        const answerEl = document.createElement('div');
        answerEl.className = 'answer-item-float';
        
        let typeLabel = '';
        let typeClass = '';
        
        if (answer.type === 'match') {
            typeLabel = '🟢';
            typeClass = 'answer-correct';
        } else if (answer.type === 'avoid') {
            typeLabel = '🔴';
            typeClass = 'answer-avoid';
        } else if (answer.type === 'neutral') {
            typeLabel = '🟡';
            typeClass = 'answer-neutral';
        } else if (answer.type === 'super') {
            typeLabel = '💛';
            typeClass = 'answer-super';
        } else if (answer.type === 'bad') {
            typeLabel = '⚫';
            typeClass = 'answer-bad';
        }
        
        answerEl.classList.add(typeClass);
        answerEl.innerHTML = `
            <span class="answer-type-badge">${typeLabel}</span>
            <span class="answer-text-float">${answer.text}</span>
            <button class="btn-remove-float" onclick="removeAnswer(${index})">×</button>
        `;
        
        answersListFloat.appendChild(answerEl);
    });
}

window.removeAnswer = function(index) {
    gameState.answers.splice(index, 1);
    updateAnswersListFloat();
};

// Start Game (Final)
startGameBtnFinal.addEventListener('click', () => {
    const question = questionTextInput.value.trim();
    
    if (!question) {
        alert('الرجاء إدخال السؤال');
        return;
    }
    
    if (gameState.answers.length === 0) {
        alert('الرجاء إضافة إجابة واحدة على الأقل');
        return;
    }
    
    const duration = parseInt(gameDurationInput.value);
    
    startGame(question, duration);
});

function startGame(question, duration) {
    gameState.currentGame = question;
    gameState.timeRemaining = duration;
    gameState.participants.clear();
    
    questionInputScreen.classList.add('hidden');
    activeGameCard.classList.remove('hidden');
    resultsDisplay.classList.add('hidden');
    
    activeQuestion.textContent = question;
    timerText.textContent = duration;
    
    updateParticipantsList();
    startTimer(duration);
    
    gameState.client.say(gameState.channel, `🎮 سؤال جديد: ${question}`);
    gameState.client.say(gameState.channel, `⏰ الوقت: ${duration} ثانية`);
    gameState.client.say(gameState.channel, `📝 اكتب إجابتك بـ ! (مثال: !السعودية)`);
}

function startTimer(duration) {
    const circumference = 2 * Math.PI * 35;
    timerCircle.style.strokeDasharray = circumference;
    timerCircle.style.strokeDashoffset = 0;
    
    let timeLeft = duration;
    
    gameState.timer = setInterval(() => {
        timeLeft--;
        gameState.timeRemaining = timeLeft;
        timerText.textContent = timeLeft;
        
        const progress = timeLeft / duration;
        const offset = circumference * (1 - progress);
        timerCircle.style.strokeDashoffset = offset;
        
        if (timeLeft <= 0) {
            endCurrentGame();
        }
    }, 1000);
}

function handleMessage(channel, tags, message, self) {
    if (self) return;
    
    const username = tags['display-name'] || tags.username;
    let messageText = message.trim();
    
    // Check for !توب or !top
    if (messageText === '!توب' || messageText === '!top') {
        sendLeaderboardToChat();
        return;
    }
    
    if (!gameState.currentGame) return;
    
    // Only accept messages starting with !
    if (!messageText.startsWith('!')) {
        return;
    }
    
    // Remove ! and trim
    messageText = messageText.substring(1).trim();
    
    if (gameState.participants.has(username)) {
        return;
    }
    
    gameState.participants.set(username, messageText);
    updateParticipantsList();
}

function updateParticipantsList() {
    const count = gameState.participants.size;
    participantsCount.textContent = count;
    
    if (count === 0) {
        participantsList.innerHTML = '<div class="empty-state">لا يوجد مشاركون بعد</div>';
        return;
    }
    
    participantsList.innerHTML = '';
    gameState.participants.forEach((answer, username) => {
        const participantEl = document.createElement('div');
        participantEl.className = 'participant-item';
        participantEl.innerHTML = `
            <span class="participant-name">${username}</span>
            <span class="participant-answer">${answer}</span>
        `;
        participantsList.appendChild(participantEl);
    });
}

// End Game Button
endGameBtn.addEventListener('click', () => {
    endCurrentGame();
});

function endCurrentGame() {
    if (!gameState.currentGame) return;
    
    clearInterval(gameState.timer);
    
    const results = [];
    const answerGroups = {}; // Group participants by their answers
    
    gameState.participants.forEach((answer, username) => {
        const result = evaluateAnswer(answer);
        results.push({
            username: username,
            answer: answer,
            points: result.points,
            type: result.type,
            matchedAnswer: result.matchedAnswer
        });
        
        // Update leaderboard
        const currentScore = gameState.leaderboard.get(username) || 0;
        gameState.leaderboard.set(username, currentScore + result.points);
        
        // Group by matched answer
        const key = result.matchedAnswer || 'other';
        if (!answerGroups[key]) {
            answerGroups[key] = {
                answer: result.matchedAnswer || 'إجابات أخرى',
                points: result.points,
                type: result.type,
                participants: []
            };
        }
        answerGroups[key].participants.push(username);
    });
    
    displayResults(answerGroups);
    
    gameState.client.say(gameState.channel, `⏱️ انتهى الوقت!`);
    
    gameState.currentGame = null;
    activeGameCard.classList.add('hidden');
    updateLeaderboard();
}

function evaluateAnswer(userAnswer) {
    for (const answer of gameState.answers) {
        // Use fuzzy matching instead of exact match
        if (isSimilarText(userAnswer, answer.text)) {
            let points = 0;
            let type = 'neutral';
            
            if (answer.type === 'super') {
                points = 2;
                type = 'super';
            } else if (gameState.gameMode === 'match' || answer.type === 'match') {
                points = 1;
                type = 'correct';
            } else if (answer.type === 'neutral') {
                points = 0;
                type = 'neutral';
            } else if (gameState.gameMode === 'avoid' || answer.type === 'avoid') {
                points = -1;
                type = 'incorrect';
            } else if (answer.type === 'bad') {
                points = -2;
                type = 'bad';
            }
            
            return { points, type, matchedAnswer: answer.text };
        }
    }
    
    // No match found
    if (gameState.gameMode === 'match') {
        return { points: 0, type: 'neutral', matchedAnswer: null };
    } else if (gameState.gameMode === 'avoid') {
        return { points: 1, type: 'correct', matchedAnswer: null };
    } else {
        return { points: 0, type: 'neutral', matchedAnswer: null };
    }
}

function displayResults(answerGroups) {
    resultsDisplay.classList.remove('hidden');
    resultsGrid.innerHTML = '';
    
    Object.values(answerGroups).forEach(group => {
        const boxEl = document.createElement('div');
        boxEl.className = `result-box ${group.type}`;
        
        let pointsText = '';
        if (group.points > 0) {
            pointsText = `+${group.points}`;
        } else if (group.points < 0) {
            pointsText = `${group.points}`;
        } else {
            pointsText = '0';
        }
        
        boxEl.innerHTML = `
            <div class="result-answer-word">${group.answer}</div>
            <div class="result-points">${pointsText} نقطة</div>
            <div class="result-participants-list">
                ${group.participants.map(p => `<div class="result-participant">${p}</div>`).join('')}
            </div>
        `;
        
        resultsGrid.appendChild(boxEl);
    });
}

// Next Round Button
nextRoundBtn.addEventListener('click', () => {
    resultsDisplay.classList.add('hidden');
    questionInputScreen.classList.remove('hidden');
    questionTextInput.value = '';
    gameState.answers = [];
    updateAnswersListFloat();
});

// Leaderboard Toggle
leaderboardToggleBtn.addEventListener('click', () => {
    leaderboardCard.classList.toggle('hidden');
});

function updateLeaderboard() {
    if (gameState.leaderboard.size === 0) {
        leaderboardList.innerHTML = '<div class="empty-state">لا توجد نقاط بعد</div>';
        return;
    }
    
    const sorted = Array.from(gameState.leaderboard.entries())
        .sort((a, b) => b[1] - a[1]);
    
    leaderboardList.innerHTML = '';
    sorted.forEach(([player, score], index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'leaderboard-item';
        
        let rank = index + 1;
        if (index === 0) rank = '🥇';
        else if (index === 1) rank = '🥈';
        else if (index === 2) rank = '🥉';
        
        itemEl.innerHTML = `
            <span class="leaderboard-rank">${rank}</span>
            <span class="leaderboard-name">${player}</span>
            <span class="leaderboard-score">${score}</span>
        `;
        
        leaderboardList.appendChild(itemEl);
    });
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

// Disconnect
disconnectBtn.addEventListener('click', () => {
    if (gameState.client) {
        gameState.client.disconnect();
    }
    gameState.isConnected = false;
    gameSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
});

}); // End DOMContentLoaded
