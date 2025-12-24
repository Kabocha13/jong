// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 

const EXCLUDED_PLAYERS = ['3mahjong']; 

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));

/**
 * ★★★ 新規追加: 2026年1月1日へのカウントダウン更新関数 ★★★
 */
function updateCountdown() {
    const display = document.getElementById('countdown-display');
    if (!display) return;

    const targetDate = new Date('2026-01-01T00:00:00').getTime();
    
    const tick = () => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            display.textContent = "明けましておめでとうございます！ (2026)";
            display.style.color = "var(--color-electric-gold)";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        display.innerHTML = `
            <span class="cd-num">${days}</span><span class="cd-unit">日</span>
            <span class="cd-num">${String(hours).padStart(2, '0')}</span><span class="cd-unit">時間</span>
            <span class="cd-num">${String(minutes).padStart(2, '0')}</span><span class="cd-unit">分</span>
            <span class="cd-num">${String(seconds).padStart(2, '0')}</span><span class="cd-unit">秒</span>
        `;
    };

    tick();
    setInterval(tick, 1000);
}

/**
 * データの取得とランキングの描画を行うメイン関数
 */
async function renderScores() {
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !RACE_RECORDS_LIST || !LAST_UPDATE_ELEMENT || !LOTTERY_LIST_CONTAINER) {
        console.error("致命的なHTML要素の一部が見つかりませんでした。レンダリングを停止します。");
        return; 
    }

    SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
    SPORTS_BETS_CONTAINER.innerHTML = '<p>くじデータを読み込み中...</p>';
    LOTTERY_LIST_CONTAINER.innerHTML = '<p>宝くじデータを読み込み中...</p>'; 
    RACE_RECORDS_LIST.innerHTML = '<li>記録条件:ローカルフリー　ベリーハード　CPU7　ラップ1　超高速</li><p>記録を読み込み中...</p>'; 

    const allData = await fetchAllData();
    const rawScores = allData.scores;
    const sportsBets = allData.sports_bets || []; 
    const raceRecords = allData.speedstorm_records || [];
    const lotteries = allData.lotteries || []; 
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class="error">データが見つかりません。</p>';
        return;
    }

    const displayScores = rawScores.filter(player => !EXCLUDED_PLAYERS.includes(player.name));
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '<ul class="ranking-list">';
    const currentScoresMap = new Map();

    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
        const scoreDisplay = player.score.toFixed(1);
        
        let memberMark = '';
        let nameClass = 'player-name';
        
        if (player.status === 'luxury') {
            memberMark = '<span class="luxury-mark" title="ラグジュアリー会員">💎</span>';
            nameClass += ' luxury-name';
        } else if (player.status === 'premium') {
            memberMark = '<span class="premium-mark" title="プレミアム会員">👑</span>';
        } else if (player.status === 'pro') {
            memberMark = '<span class="pro-mark" title="プロ会員">⭐</span>';
        }

        currentScoresMap.set(player.name, player.score);
        
        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="${nameClass}">${player.name} ${memberMark}</span>
                <span class="player-score">${scoreDisplay} P</span>
            </li>
        `;
    });
    
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    renderSportsBets(sportsBets, displayScores);
    renderLotteries(lotteries);
    renderRaceRecords(raceRecords);

    LAST_UPDATE_ELEMENT.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    localStorage.setItem('previousScores', JSON.stringify(Array.from(currentScoresMap.entries())));
}

/**
 * 開催中の宝くじを描画する関数
 */
function renderLotteries(lotteries) {
    if (!LOTTERY_LIST_CONTAINER) return; 
    const now = new Date();
    const openLotteries = lotteries.filter(l => l.status === 'OPEN' && new Date(l.purchaseDeadline) > now);
    
    if (openLotteries.length === 0) {
        LOTTERY_LIST_CONTAINER.innerHTML = '<p class="info-text">現在、購入可能な宝くじはありません。</p>';
        return;
    }

    let html = '<div class="bet-grid">'; 
    openLotteries.forEach(l => {
        const deadline = new Date(l.purchaseDeadline);
        const announceDate = new Date(l.resultAnnounceDate);
        const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const formattedAnnounce = announceDate.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });

        let prizesTable = '<table class="lottery-prize-table"><thead><tr><th>等級</th><th>ポイント</th><th>確率</th></tr></thead><tbody>';
        let totalProbability = 0;
        l.prizes.sort((a, b) => a.rank - b.rank).forEach(p => {
            prizesTable += `<tr><td>${p.rank}等</td><td>${p.amount.toFixed(1)} P</td><td>${(p.probability * 100).toFixed(3)} %</td></tr>`;
            totalProbability += p.probability;
        });
        const lossProbability = Math.max(0, 1.0 - totalProbability);
        prizesTable += `<tr style="background-color: #f8d7da;"><td>ハズレ</td><td>0.0 P</td><td>${(lossProbability * 100).toFixed(3)} %</td></tr></tbody></table>`;

        const totalTickets = l.tickets.reduce((sum, t) => sum + (t.count || 1), 0);
        html += `
            <div class="bet-tile status-open">
                <h4>🎟️ ${l.name} (#${l.lotteryId})</h4>
                <div class="odds-info-display">
                    <p class="bet-deadline">価格: <strong>${l.ticketPrice.toFixed(1)} P /枚</strong></p>
                    <p class="bet-deadline">購入締切: ${formattedDeadline}</p>
                    <p class="bet-deadline">発表日: ${formattedAnnounce}</p>
                </div>
                <div class="my-wager-text" style="font-weight: bold; border-left-color: var(--color-accent); background-color: #fffae6; padding: 10px;">
                    <p style="margin-top: 0; margin-bottom: 5px;">🏆 当選詳細</p>
                    ${prizesTable}
                </div>
                <p class="total-wager-text">総購入枚数: ${totalTickets} 枚</p>
            </div>
        `;
    });
    html += '</div>';
    LOTTERY_LIST_CONTAINER.innerHTML = html;
}

/**
 * スピードストーム レース記録を描画する関数
 */
function renderRaceRecords(raceRecords) {
    if (!RACE_RECORDS_LIST) return;
    let html = '<li>記録条件:ローカルフリー　ベリーハード　CPU7　ラップ1　超高速</li>';
    if (raceRecords.length === 0) {
        html += '<li><p class="info-text" style="color: #6c757d; margin-top: 10px;">まだ記録が登録されていません。</p></li>';
    } else {
        const groupedRecords = raceRecords.reduce((groups, record) => {
            const match = record.courseName.match(/\((.+?)\)/);
            const groupKey = match ? match[1] : 'その他';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(record);
            return groups;
        }, {});
        Object.entries(groupedRecords).forEach(([groupName, records]) => {
            html += `<li><strong style="display: block; margin-top: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 3px;">------${groupName}------</strong></li>`;
            records.forEach(record => {
                const cleanCourseName = record.courseName.replace(/\s*\(.+?\)\s*$/, '');
                html += `<li style="display: flex; justify-content: space-between; padding-left: 20px;"><span>${cleanCourseName}:</span><span style="font-weight: bold; color: #dc3545;">${record.bestTime}</span><span style="font-size: 0.8em; color: #6c757d;">by ${record.holder}</span></li>`;
            });
        });
    }
    RACE_RECORDS_LIST.innerHTML = html;
}

/**
 * スポーツくじのタイルを描画する関数
 */
function renderSportsBets(sportsBets, displayScores) {
    if (!SPORTS_BETS_CONTAINER) return;
    const activeBets = sportsBets.filter(bet => bet.status === 'OPEN' || bet.status === 'CLOSED');
    if (activeBets.length === 0) {
        SPORTS_BETS_CONTAINER.innerHTML = '<p class="info-text">現在、開催中または結果待ちのくじはありません。</p>';
        return;
    }
    const playerNames = displayScores.map(p => p.name);
    let html = '<div class="bet-grid">';
    activeBets.forEach(bet => {
        let myWagerInfo = '';
        const playerWagers = bet.wagers.filter(w => playerNames.includes(w.player));
        const playerTotalWagers = playerWagers.reduce((sum, w) => sum + w.amount, 0);
        if (playerTotalWagers > 0) {
            myWagerInfo = `<p class="my-wager-text">✅ 合計賭け金: ${playerTotalWagers} P</p><ul class="my-wagers-list">`;
            playerWagers.forEach(wager => {
                const itemDisplay = wager.item.length > 30 ? wager.item.substring(0, 30) + '...' : wager.item;
                myWagerInfo += `<li>${itemDisplay} に ${wager.amount} P</li>`;
            });
            myWagerInfo += '</ul>';
        } else {
            myWagerInfo = `<p class="my-wager-text">まだ投票されていません。</p>`;
        }
        const statusClass = bet.status === 'OPEN' ? 'status-open' : 'status-closed';
        const statusText = bet.status === 'OPEN' ? '【開催中】' : '【締切済み】';
        let deadlineHtml = '';
        if (bet.deadline) {
            const deadline = new Date(bet.deadline);
            deadlineHtml = `<p class="bet-deadline">締切: ${deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })} ${deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>`;
        }
        html += `<div class="bet-tile ${statusClass}"><h4>${statusText} ${bet.matchName} (#${bet.betId})</h4><div class="odds-info-display">${deadlineHtml}</div>${myWagerInfo}<p class="total-wager-text">総賭け金: ${bet.wagers.reduce((sum, w) => sum + w.amount, 0)} P</p></div>`;
    });
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}

// 初期ロードとボタンイベント
window.onload = () => {
    renderScores();
    updateCountdown(); // ★ カウントダウンの初期化
};

document.getElementById('refresh-button').addEventListener('click', renderScores);
