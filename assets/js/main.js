// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const COUNTDOWN_TIMER_ELEMENT = document.getElementById('countdown-timer');

const EXCLUDED_PLAYERS = ['3mahjong']; 

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));


/**
 * ★ 秒刻みカウントダウン制御 (2025年終了ターゲット)
 */
function initCountdown() {
    if (!COUNTDOWN_TIMER_ELEMENT) return;

    function update() {
        const now = new Date();
        const year = now.getFullYear();
        // 今年の終わりの日時 (2025年12月31日 23:59:59)
        const target = new Date(2025, 11, 31, 23, 59, 59, 999);
        
        let diff = target - now;
        
        if (diff <= 0) {
            COUNTDOWN_TIMER_ELEMENT.textContent = "WELCOME TO 2026";
            COUNTDOWN_TIMER_ELEMENT.style.fontSize = "1.5em";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const dStr = days.toString().padStart(2, '0');
        const hStr = hours.toString().padStart(2, '0');
        const mStr = minutes.toString().padStart(2, '0');
        const sStr = seconds.toString().padStart(2, '0');

        COUNTDOWN_TIMER_ELEMENT.textContent = `${dStr}d ${hStr}:${mStr}:${sStr}`;
    }

    update();
    setInterval(update, 1000);
}

/**
 * データの取得とランキングの描画
 */
async function renderScores() {
    if (!SCORES_CONTAINER) return;

    SCORES_CONTAINER.innerHTML = '<p class="status-msg">SYNCING WITH SERVER...</p>';
    
    const allData = await fetchAllData(); 
    const rawScores = allData.scores;
    const sportsBets = allData.sports_bets || []; 
    const raceRecords = allData.speedstorm_records || []; 
    const lotteries = allData.lotteries || []; 
    
    if (!rawScores || rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class="error">CONNECTION LOST</p>';
        return;
    }

    const displayScores = rawScores.filter(player => !EXCLUDED_PLAYERS.includes(player.name));
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '<ul class=\"ranking-list\">';
    const currentScoresMap = new Map();

    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const scoreDisplay = player.score.toFixed(1);
        
        let memberMark = '';
        if (player.status === 'luxury') memberMark = '💎';
        else if (player.status === 'premium') memberMark = '👑';
        else if (player.status === 'pro') memberMark = '⭐';

        currentScoresMap.set(player.name, player.score);
        
        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="player-name">${player.name} ${memberMark}</span>
                <span class="player-score">${scoreDisplay} P</span>
            </li>
        `;
    });
    
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    renderSportsBets(sportsBets, displayScores);
    renderLotteries(lotteries);
    renderRaceRecords(raceRecords);

    LAST_UPDATE_ELEMENT.textContent = `LAST SYNC: ${new Date().toLocaleTimeString('ja-JP')}`;
}

/**
 * 宝くじの描画
 */
function renderLotteries(lotteries) {
    if (!LOTTERY_LIST_CONTAINER) return;
    const now = new Date();
    const openLotteries = lotteries.filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > now);
    
    if (openLotteries.length === 0) {
        LOTTERY_LIST_CONTAINER.innerHTML = '<p>NO ACTIVE TICKETS</p>';
        return;
    }

    let html = '<div class="bet-grid">'; 
    openLotteries.forEach(l => {
        html += `<div class="bet-tile"><h4>🎟️ ${l.name}</h4><p>PRICE: ${l.ticketPrice} P</p></div>`;
    });
    html += '</div>';
    LOTTERY_LIST_CONTAINER.innerHTML = html;
}

/**
 * レース記録の描画
 */
function renderRaceRecords(raceRecords) {
    if (!RACE_RECORDS_LIST) return;
    let html = '<li class="condition">FREE MODE / B.HARD / CPU7</li>';
    if (raceRecords.length === 0) {
        html += '<li>NO DATA</li>';
    } else {
        raceRecords.forEach(r => {
            html += `<li>${r.courseName}: <strong>${r.bestTime}</strong> (by ${r.holder})</li>`;
        });
    }
    RACE_RECORDS_LIST.innerHTML = html;
}

/**
 * スポーツくじの描画
 */
function renderSportsBets(sportsBets, displayScores) {
    if (!SPORTS_BETS_CONTAINER) return;
    const activeBets = sportsBets.filter(bet => bet.status === 'OPEN');
    if (activeBets.length === 0) {
        SPORTS_BETS_CONTAINER.innerHTML = '<p>NO MATCHES AVAILABLE</p>';
        return;
    }

    let html = '<div class="bet-grid">';
    activeBets.forEach(bet => {
        html += `<div class="bet-tile"><h4>⚽ ${bet.matchName}</h4><p>POT: ${bet.wagers.reduce((s, w) => s + w.amount, 0)} P</p></div>`;
    });
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}

window.onload = () => {
    renderScores();
    initCountdown();
};

document.getElementById('refresh-button').addEventListener('click', renderScores);
