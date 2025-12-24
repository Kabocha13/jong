// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const COUNTDOWN_TIMER_ELEMENT = document.getElementById('countdown-timer');

const EXCLUDED_PLAYERS = ['3mahjong']; 

/**
 * ★ ナビゲーションの認証チェック
 * 未認証の場合はリンクを隠し、認証済みの場合のみ表示する
 */
function updateNavigation() {
    const authUser = localStorage.getItem('authenticatedUser');
    const masterUser = localStorage.getItem('masterUser');
    
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

    if (masterUser) {
        masterLinks.forEach(el => el.classList.remove('hidden'));
    } else {
        masterLinks.forEach(el => el.classList.add('hidden'));
    }
}

/**
 * ★ カウントダウン制御
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
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        COUNTDOWN_TIMER_ELEMENT.textContent = `${d.toString().padStart(2,'0')}d ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
    update();
    setInterval(update, 1000);
}

/**
 * データの取得と描画
 */
async function renderScores() {
    if (!SCORES_CONTAINER) return;
    SCORES_CONTAINER.innerHTML = '<p class="status-msg">SYNCING INTERFACE...</p>';
    
    const allData = await fetchAllData(); 
    const rawScores = allData.scores || [];
    const sportsBets = allData.sports_bets || []; 
    const raceRecords = allData.speedstorm_records || []; 
    const lotteries = allData.lotteries || []; 

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
 * ★ 宝くじ詳細の描画 (復元)
 */
function renderLotteries(lotteries) {
    if (!LOTTERY_LIST_CONTAINER) return;
    const now = new Date();
    const openLotteries = lotteries.filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > now);
    
    if (openLotteries.length === 0) {
        LOTTERY_LIST_CONTAINER.innerHTML = '<p class="status-msg">NO MODULES ACTIVE</p>';
        return;
    }

    let html = '<div class="bet-grid">'; 
    openLotteries.forEach(l => {
        const deadline = new Date(l.purchaseDeadline);
        const announce = new Date(l.resultAnnounceDate);
        
        // 当選テーブルの構築
        let tableHtml = '<table class="cyber-table">';
        tableHtml += '<thead><tr><th>RANK</th><th>REWARD</th><th>PROB</th></tr></thead><tbody>';
        
        let totalProb = 0;
        l.prizes.sort((a,b) => a.rank - b.rank).forEach(p => {
            tableHtml += `<tr><td>${p.rank}</td><td>${p.amount.toFixed(1)}P</td><td>${(p.probability*100).toFixed(3)}%</td></tr>`;
            totalProb += p.probability;
        });
        const loss = Math.max(0, 1.0 - totalProb);
        tableHtml += `<tr class="loss-row"><td>LOSS</td><td>0.0P</td><td>${(loss*100).toFixed(3)}%</td></tr></tbody></table>`;

        const totalTickets = l.tickets.reduce((sum, t) => sum + (t.count || 1), 0);

        html += `
            <div class="bet-tile neon-border-purple">
                <h4 class="tile-title">🎟️ ${l.name}</h4>
                <div class="tile-details">
                    <p>UNIT PRICE: <strong>${l.ticketPrice.toFixed(1)} P</strong></p>
                    <p>DEADLINE: ${deadline.toLocaleDateString()} ${deadline.getHours()}:${deadline.getMinutes().toString().padStart(2,'0')}</p>
                </div>
                <div class="prize-module">${tableHtml}</div>
                <p class="ticket-count">TOTAL TICKETS: ${totalTickets}</p>
            </div>
        `;
    });
    html += '</div>';
    LOTTERY_LIST_CONTAINER.innerHTML = html;
}

/**
 * レース記録
 */
function renderRaceRecords(raceRecords) {
    if (!RACE_RECORDS_LIST) return;
    let html = '<li class="condition">LOG: B.HARD / CPU7 / LAP1 / HYPER</li>';
    if (raceRecords.length === 0) html += '<li>NO DATA</li>';
    else {
        raceRecords.forEach(r => {
            html += `<li class="race-item"><span>${r.courseName}</span><span class="time">${r.bestTime}</span><span class="holder">by ${r.holder}</span></li>`;
        });
    }
    RACE_RECORDS_LIST.innerHTML = html;
}

/**
 * スポーツくじ
 */
function renderSportsBets(sportsBets, displayScores) {
    if (!SPORTS_BETS_CONTAINER) return;
    const activeBets = sportsBets.filter(bet => bet.status === 'OPEN');
    if (activeBets.length === 0) {
        SPORTS_BETS_CONTAINER.innerHTML = '<p class="status-msg">NO TARGETS ACQUIRED</p>';
        return;
    }
    let html = '<div class="bet-grid">';
    activeBets.forEach(bet => {
        const total = bet.wagers.reduce((s, w) => s + w.amount, 0);
        html += `<div class="bet-tile neon-border-cyan"><h4>⚽ ${bet.matchName}</h4><p class="pot-info">TOTAL POT: ${total} P</p></div>`;
    });
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}

window.onload = () => {
    updateNavigation(); // ナビ制御
    renderScores();
    initCountdown();
};

document.getElementById('refresh-button').addEventListener('click', renderScores);
