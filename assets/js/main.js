// assets/js/main.js (Ranking Page)

const SCORES_CONTAINER = document.getElementById('scores-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const COUNTDOWN_TIMER_ELEMENT = document.getElementById('countdown-timer');

const EXCLUDED_PLAYERS = ['3mahjong']; 

/**
 * ★ ナビゲーションの認証状態更新 (全JS共通で呼び出す)
 */
function updateNavigation() {
    const authUser = localStorage.getItem('authUsername') || localStorage.getItem('pvpAuthUsername');
    const masterUser = localStorage.getItem('masterUser'); // マスターページはメモリ管理だが、便宜上チェック
    
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

    // マスター認証はページをまたぐ場合再認証が必要な設計だが、
    // UIとしてリンクを出すかどうかをここで制御
    if (masterUser || (window.isAuthenticatedAsMaster)) {
        masterLinks.forEach(el => el.classList.remove('hidden'));
    }
}

function initCountdown() {
    if (!COUNTDOWN_TIMER_ELEMENT) return;
    function update() {
        const now = new Date();
        const target = new Date(2025, 11, 31, 23, 59, 59);
        let diff = target - now;
        if (diff <= 0) { COUNTDOWN_TIMER_ELEMENT.textContent = "MISSION COMPLETE: 2026"; return; }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        COUNTDOWN_TIMER_ELEMENT.textContent = `${d}d ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
    update(); setInterval(update, 1000);
}

async function renderScores() {
    if (!SCORES_CONTAINER) return;
    SCORES_CONTAINER.innerHTML = '<p class="status-msg">SYNCING CORE...</p>';
    
    const allData = await fetchAllData(); 
    const rawScores = allData.scores || [];
    const displayScores = rawScores.filter(player => !EXCLUDED_PLAYERS.includes(player.name));
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '';
    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        html += `<div class="ranking-item ${rankClass}"><span>#${rank} ${player.name}</span><span>${player.score.toFixed(1)} P</span></div>`;
    });
    SCORES_CONTAINER.innerHTML = html;
    LAST_UPDATE_ELEMENT.textContent = `LAST SYNC: ${new Date().toLocaleTimeString()}`;

    // 宝くじとスポーツくじの描画ロジックは以前のコードと同様のため省略（詳細は main.js 参照）
}

window.onload = () => {
    updateNavigation();
    renderScores();
    initCountdown();
};

document.getElementById('refresh-button').addEventListener('click', renderScores);
