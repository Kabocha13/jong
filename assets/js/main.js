// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const COUNTDOWN_TIMER_ELEMENT = document.getElementById('countdown-timer');

const EXCLUDED_PLAYERS = ['3mahjong']; 

/**
 * ★ ナビゲーションの表示制御
 */
function updateNavigation() {
    const authUser = localStorage.getItem('authUsername') || localStorage.getItem('pvpAuthUsername');
    // マスターはメモリ管理だが、便宜上フラグをチェック
    const isMaster = window.isAuthenticatedAsMaster || false;

    const authLinks = document.querySelectorAll('.auth-required');
    const masterLinks = document.querySelectorAll('.master-required');
    const guestLinks = document.querySelectorAll('.guest-only');

    if (authUser) {
        authLinks.forEach(el => el.classList.remove('hidden'));
        guestLinks.forEach(el => el.classList.add('hidden'));
    } else {
        authLinks.forEach(el => el.classList.add('hidden'));
        guestLinks.forEach(el => el.classList.remove('hidden'));
    }

    if (isMaster) {
        masterLinks.forEach(el => el.classList.remove('hidden'));
    }
}

/**
 * ★ 秒刻みカウントダウン制御 (2025年終了ターゲット)
 */
function initCountdown() {
    if (!COUNTDOWN_TIMER_ELEMENT) return;

    function update() {
        const now = new Date();
        const target = new Date(2025, 11, 31, 23, 59, 59, 999);
        let diff = target - now;
        
        if (diff <= 0) {
            COUNTDOWN_TIMER_ELEMENT.textContent = "NEW ERA: 2026";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        COUNTDOWN_TIMER_ELEMENT.textContent = `${days}d ${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
    }

    update();
    setInterval(update, 1000);
}

/**
 * データの取得とランキングの描画
 */
async function renderScores() {
    if (!SCORES_CONTAINER) return;

    SCORES_CONTAINER.innerHTML = '<p class="status-msg">SYNCING INTERFACE...</p>';
    
    const allData = await fetchAllData(); 
    const rawScores = allData.scores || [];
    const sportsBets = allData.sports_bets || []; 
    const raceRecords = allData.speedstorm_records || []; 
    const lotteries = allData.lotteries || []; 
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class=\"error\">OFFLINE: DATA SYNC FAILED</p>';
        return;
    }

    const displayScores = rawScores.filter(player => !EXCLUDED_PLAYERS.includes(player.name));
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '<ul class=\"ranking-list\">';
    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        let mark = '';
        if (player.status === 'luxury') mark = '💎';
        else if (player.status === 'premium') mark = '👑';
        else if (player.status === 'pro') mark = '⭐';

        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="player-name">${player.name} ${mark}</span>
                <span class="player-score">${player.score.toFixed(1)} P</span>
            </li>
        `;
    });
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    renderSportsBets(sportsBets, displayScores);
    renderLotteries(lotteries);
    renderRaceRecords(raceRecords);

    LAST_UPDATE_ELEMENT.textContent = `LAST SYNC: ${new Date().toLocaleTimeString()}`;
}

/**
 * 宝くじの描画
 */
function renderLotteries(lotteries) {
    if (!LOTTERY_LIST_CONTAINER) return; 

    const now = new Date();
    const openLotteries = lotteries.filter(l => 
        l.status === 'OPEN' && new Date(l.purchaseDeadline) > now
    );
    
    if (openLotteries.length === 0) {
        LOTTERY_LIST_CONTAINER.innerHTML = '<p class="status-msg">NO MODULES ACTIVE</p>';
        return;
    }

    let html = ''; 

    openLotteries.forEach(l => {
        const deadline = new Date(l.purchaseDeadline);
        let prizesTable = '<table class="lottery-prize-table"><thead><tr><th>RANK</th><th>REWARD</th><th>PROB</th></tr></thead><tbody>';
        
        let totalProb = 0;
        l.prizes.sort((a, b) => a.rank - b.rank).forEach(p => {
            prizesTable += `<tr><td>${p.rank}等</td><td>${p.amount.toFixed(1)} P</td><td>${(p.probability * 100).toFixed(3)} %</td></tr>`;
            totalProb += p.probability;
        });
        
        const lossProb = Math.max(0, 1.0 - totalProb);
        prizesTable += `<tr><td>ハズレ</td><td>0.0 P</td><td>${(lossProb * 100).toFixed(3)} %</td></tr></tbody></table>`;

        html += `
            <div class="bet-tile neon-border-purple" style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.3);">
                <h4 style="margin-top: 0; color: var(--electric-cyan);">🎟️ ${l.name}</h4>
                <p style="font-size: 0.85em; margin: 5px 0;">PRICE: <strong>${l.ticketPrice.toFixed(1)} P</strong></p>
                <p style="font-size: 0.85em; margin: 5px 0;">DEADLINE: ${deadline.toLocaleString()}</p>
                ${prizesTable}
            </div>
        `;
    });
    
    LOTTERY_LIST_CONTAINER.innerHTML = html;
}

/**
 * レース記録描画
 */
function renderRaceRecords(raceRecords) {
    if (!RACE_RECORDS_LIST) return;
    let html = '<li class="condition">LOG: B.HARD / CPU7 / LAP1 / HYPER</li>';
    if (raceRecords.length === 0) {
        html += '<li>NO DATA</li>';
    } else {
        raceRecords.forEach(r => {
            html += `<li class="race-item" style="display: flex; justify-content: space-between;">
                <span>${r.courseName}</span>
                <span style="color: var(--electric-cyan); font-weight: bold;">${r.bestTime}</span>
            </li>`;
        });
    }
    RACE_RECORDS_LIST.innerHTML = html;
}

/**
 * スポーツくじ描画
 */
function renderSportsBets(sportsBets, displayScores) {
    if (!SPORTS_BETS_CONTAINER) return;
    const activeBets = sportsBets.filter(bet => bet.status === 'OPEN');
    if (activeBets.length === 0) {
        SPORTS_BETS_CONTAINER.innerHTML = '<p class="status-msg">NO TARGETS ACQUIRED</p>';
        return;
    }
    let html = '<div class="bet-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">';
    activeBets.forEach(bet => {
        html += `<div class="bet-tile neon-border-cyan" style="padding: 10px; background: rgba(0,0,0,0.3);">
            <h4 style="margin: 0; font-size: 0.9em;">⚽ ${bet.matchName}</h4>
            <p style="font-size: 0.75em; margin: 5px 0;">ID: #${bet.betId}</p>
        </div>`;
    });
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}

window.onload = () => {
    updateNavigation();
    renderScores();
    initCountdown();
};

document.getElementById('refresh-button').addEventListener('click', renderScores);
