// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
// 削除: const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
// ★★★ 新規追加: 宝くじコンテナ要素
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 

const EXCLUDED_PLAYERS = ['3mahjong'];
const LS_DATA_KEY = 'cachedHomeData';

/**
 * データを受け取って全セクションを描画する
 */
function renderWithData(allData, isStale = false) {
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !LAST_UPDATE_ELEMENT || !LOTTERY_LIST_CONTAINER) return;

    const rawScores = allData.scores || [];
    const sportsBets = allData.sports_bets || [];
    const lotteries = allData.lotteries || [];
    const careerPosts = allData.career_posts || [];

    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class="error">データが見つかりませんでした。</p>';
        return;
    }

    const displayScores = rawScores.filter(p => !EXCLUDED_PLAYERS.includes(p.name));
    const sortedScores = [...displayScores].sort((a, b) => b.score - a.score);

    let html = '<ul class="ranking-list">';
    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
        let memberMark = '', nameClass = 'player-name';
        if (player.status === 'luxury') {
            memberMark = '<span class="luxury-mark" title="ラグジュアリー会員">💎</span>';
            nameClass += ' luxury-name';
        } else if (player.status === 'pro') {
            memberMark = '<span class="pro-mark" title="プロ会員">⭐</span>';
        }
        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="${nameClass}">${player.name} ${memberMark}</span>
                <span class="player-score">${player.score.toFixed(1)} P</span>
            </li>`;
    });
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    renderSportsBets(sportsBets, displayScores);
    renderLotteries(lotteries);
    renderHomeCareer(careerPosts);

    const timeStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    LAST_UPDATE_ELEMENT.textContent = isStale ? `キャッシュ表示 (更新中...)` : `最終更新: ${timeStr}`;
}

/**
 * キャッシュから即時描画 → バックグラウンドで最新取得して更新
 */
async function renderScores() {
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !LAST_UPDATE_ELEMENT || !LOTTERY_LIST_CONTAINER) return;

    // 1. キャッシュがあれば即座に描画 (ローディング表示なし)
    const cached = localStorage.getItem(LS_DATA_KEY);
    if (cached) {
        try {
            renderWithData(JSON.parse(cached), true);
        } catch (e) {
            SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
        }
    } else {
        SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
        SPORTS_BETS_CONTAINER.innerHTML = '<p>くじデータを読み込み中...</p>';
        LOTTERY_LIST_CONTAINER.innerHTML = '<p>宝くじデータを読み込み中...</p>';
    }

    // 2. 最新データを取得して更新
    const allData = await fetchAllData();
    if (!allData.scores || allData.scores.length === 0) {
        if (!cached) SCORES_CONTAINER.innerHTML = '<p class="error">データ取得に失敗しました。</p>';
        return;
    }

    renderWithData(allData, false);
    localStorage.setItem(LS_DATA_KEY, JSON.stringify(allData));
}

/**
 * ★★★ 修正: 開催中の宝くじを描画する関数 (当選情報の表を追加) ★★★
 * @param {Array<Object>} lotteries - lotteriesデータ
 */
function renderLotteries(lotteries) {
    if (!LOTTERY_LIST_CONTAINER) return; 

    const now = new Date();
    // OPEN状態で、購入締切がまだ来ていない宝くじのみを表示
    const openLotteries = lotteries.filter(l => 
        l.status === 'OPEN' && new Date(l.purchaseDeadline) > now
    );
    
    if (openLotteries.length === 0) {
        LOTTERY_LIST_CONTAINER.innerHTML = '<p class="info-text">現在、購入可能な宝くじはありません。</p>';
        return;
    }

    // スポーツくじと同じデザインのグリッドを使用
    let html = '<div class="bet-grid">'; 

    openLotteries.forEach(l => {
        const deadline = new Date(l.purchaseDeadline);
        const announceDate = new Date(l.resultAnnounceDate);

        // 締切と発表日のフォーマット
        const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                  deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const formattedAnnounce = announceDate.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });

        // 当選情報の表を作成
        let prizesTable = '<table class="lottery-prize-table">';
        prizesTable += '<thead><tr><th>等級</th><th>ポイント</th><th>確率</th></tr></thead>';
        prizesTable += '<tbody>';
        
        let totalProbability = 0;

        l.prizes.sort((a, b) => a.rank - b.rank); // ランク順にソート

        l.prizes.forEach(p => {
            prizesTable += `
                <tr>
                    <td>${p.rank}等</td>
                    <td>${p.amount.toFixed(1)} P</td>
                    <td>${(p.probability * 100).toFixed(3)} %</td>
                </tr>
            `;
            totalProbability += p.probability;
        });
        
        // ハズレの確率を計算
        const lossProbability = Math.max(0, 1.0 - totalProbability);
        
        prizesTable += `
            <tr style="background-color: #f8d7da;">
                <td>ハズレ</td>
                <td>0.0 P</td>
                <td>${(lossProbability * 100).toFixed(3)} %</td>
            </tr>
        `;
        
        prizesTable += '</tbody></table>';

        // ★★★ 修正箇所: チケット総枚数の計算 (集約型データに対応) ★★★
        const totalTickets = l.tickets.reduce((sum, t) => sum + (t.count || 1), 0);

        html += `
            <div class="bet-tile lottery-tile status-open">
                <h4>🎟️ ${l.name} (#${l.lotteryId})</h4>
                <div class="odds-info-display">
                    <p class="bet-deadline">価格: <strong>${l.ticketPrice.toFixed(1)} P /枚</strong></p>
                    <p class="bet-deadline">購入締切: ${formattedDeadline}</p>
                    <p class="bet-deadline">発表日: ${formattedAnnounce}</p>
                </div>
                <!-- 当選概要の表 -->
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
 * スポーツくじのタイルを描画する関数
 * @param {Array<Object>} sportsBets - sports_betsデータ
 * @param {Array<Object>} displayScores - ランキングに表示されているプレイヤーのスコア
 */
function renderSportsBets(sportsBets, displayScores) {
    if (!SPORTS_BETS_CONTAINER) return; // ★ 修正: nullチェックを追加

    // OPENとCLOSEDのくじを表示
    const activeBets = sportsBets.filter(bet => bet.status === 'OPEN' || bet.status === 'CLOSED');
    
    if (activeBets.length === 0) {
        SPORTS_BETS_CONTAINER.innerHTML = '<p class="info-text">現在、開催中または結果待ちのくじはありません。</p>';
        return;
    }

    // プレイヤー名の配列を取得
    const playerNames = displayScores.map(p => p.name);

    let html = '<div class="bet-grid">';
    
    activeBets.forEach(bet => {
        let myWagerInfo = '';
        let totalWagers = 0;
        
        const playerWagers = bet.wagers.filter(w => playerNames.includes(w.player));
        
        // プレイヤーごとの合計掛け金を計算
        const playerTotalWagers = playerWagers.reduce((sum, w) => sum + w.amount, 0);

        if (playerTotalWagers > 0) {
            totalWagers = playerTotalWagers;
            myWagerInfo = `<p class="my-wager-text">✅ 合計賭け金: ${totalWagers} P</p>`;
            myWagerInfo += '<ul class="my-wagers-list">';
            
            // プレイヤーごとの個別の賭けを表示
            playerWagers.forEach(wager => {
                const itemDisplay = wager.item.length > 30 ? wager.item.substring(0, 30) + '...' : wager.item;
                // 投票履歴はマイページで確認する形にするため、ここでは簡易表示に
                myWagerInfo += `<li>${itemDisplay} に ${wager.amount} P</li>`;
            });

            myWagerInfo += '</ul>';
        } else {
            myWagerInfo = `<p class="my-wager-text">まだ投票されていません。</p>`;
        }
        
        const statusClass = bet.status === 'OPEN' ? 'status-open' : 'status-closed';
        const statusText = bet.status === 'OPEN' ? '【開催中】' : '【締切済み】';

        // 締切日時の表示 (deadlineが有効な場合)
        let deadlineHtml = '';
        if (bet.deadline) {
            const deadline = new Date(bet.deadline);
            const formattedDeadline = deadline.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) + ' ' + 
                                      deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            deadlineHtml = `<p class="bet-deadline">締切: ${formattedDeadline}</p>`;
        }

        html += `
            <div class="bet-tile ${statusClass}">
                <h4>${statusText} ${bet.matchName} (#${bet.betId})</h4>
                <div class="odds-info-display">
                    ${deadlineHtml}
                    <!-- 削除: 開設者名の表示 -->
                    <!-- <p class="bet-creator">開設者: <strong>${bet.creator || 'N/A'}</strong></p> -->
                </div>
                ${myWagerInfo}
                <p class="total-wager-text">総賭け金: ${bet.wagers.reduce((sum, w) => sum + w.amount, 0)} P</p>
            </div>
        `;
    });
    
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}


// 初期ロードとボタンイベント
window.onload = renderScores;

document.getElementById('refresh-button').addEventListener('click', renderScores);


/**
 * ホーム画面の就活ランキングを描画する関数
 * @param {Array<Object>} posts - career_posts データ
 */
function renderHomeCareer(posts) {
    const container = document.getElementById('home-career-container');
    if (!container) return;

    if (!posts || posts.length === 0) {
        container.innerHTML = '<p class="info-text">まだ就活データがありません。</p>';
        return;
    }

    const stats = {};
    for (const post of posts) {
        if (!stats[post.player]) {
            stats[post.player] = { offers: 0, finalPassed: 0, interviews: 0, docPassed: 0 };
        }
        if (post.type === 'offer')                          stats[post.player].offers++;
        else if (post.type === 'pass_interview_final')      stats[post.player].finalPassed++;
        else if (post.type.startsWith('pass_interview_'))   stats[post.player].interviews++;
        else if (post.type === 'pass_doc')                  stats[post.player].docPassed++;
    }

    const players = Object.entries(stats).sort((a, b) => {
        const s = (p) => p[1].offers * 1000 + p[1].finalPassed * 100 + p[1].interviews * 10 + p[1].docPassed;
        return s(b) - s(a);
    });

    const medals = ['🥇', '🥈', '🥉'];
    let html = `
        <table class="career-table">
            <thead>
                <tr>
                    <th></th>
                    <th>名前</th>
                    <th>内定</th>
                    <th>最終</th>
                    <th>面接</th>
                    <th>書類</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(([name, s], i) => `
                <tr>
                    <td>${medals[i] || i + 1}</td>
                    <td>${name}</td>
                    <td>${s.offers > 0 ? `<span class="career-offers">${s.offers}</span>` : '—'}</td>
                    <td>${s.finalPassed || '—'}</td>
                    <td>${s.interviews || '—'}</td>
                    <td>${s.docPassed || '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <p style="text-align:right; margin-top:10px;"><a href="career.html" class="career-link">詳細・投稿 →</a></p>
    `;

    container.innerHTML = html;
}

// 食堂メニュー
function loadCafeteriaMenu() {
    const img = document.getElementById('tsudanuma-menu');
    if (!img) return;

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;

    // 翌月1週目 → 今月5〜1週目 の順に試し、最初に見つかった画像を表示
    const candidates = [
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${ny}${pad(nm)}_1.png`,
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${year}${pad(month)}_5.png`,
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${year}${pad(month)}_4.png`,
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${year}${pad(month)}_3.png`,
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${year}${pad(month)}_2.png`,
        `https://www.cit-s.com/wp/wp-content/themes/cit/menu/td_${year}${pad(month)}_1.png`,
    ];

    function tryNext(i) {
        if (i >= candidates.length) {
            img.style.display = 'none';
            return;
        }
        const probe = new Image();
        probe.onload = function () { img.src = candidates[i]; };
        probe.onerror = function () { tryNext(i + 1); };
        probe.src = candidates[i];
    }

    tryNext(0);
}

loadCafeteriaMenu();

// 食堂リアルタイムカメラ
function getCameraTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isCameraActive() {
    const d = new Date();
    const day = d.getDay(); // 0=日, 6=土
    const hour = d.getHours();
    return day >= 1 && day <= 5 && hour >= 10 && hour < 14;
}

function refreshCafeteriaCamera() {
    const img = document.getElementById('tsudanuma');
    const msg = document.getElementById('camera-closed-msg');
    if (!img) return;

    if (isCameraActive()) {
        img.src = `https://www.cit-s.com/i_catch/dining/tsudanuma.jpg?${getCameraTimestamp()}`;
        img.style.display = 'block';
        if (msg) msg.style.display = 'none';
    } else {
        img.style.display = 'none';
        if (msg) msg.style.display = 'block';
    }
}

// 初回タイムスタンプ付きで設定
refreshCafeteriaCamera();
setInterval(refreshCafeteriaCamera, 60000);

// 天気予報（今日・明日）
(function () {
    // wttr.in の天気コード → 絵文字
    const WTTR_ICON = {
        113: '☀️', 116: '🌤️', 119: '⛅', 122: '☁️',
        143: '🌫️', 248: '🌫️', 260: '🌫️',
        176: '🌦️', 263: '🌦️', 266: '🌦️', 293: '🌦️', 296: '🌦️', 353: '🌦️',
        179: '🌨️', 227: '🌨️', 320: '🌨️', 323: '🌨️', 326: '🌨️', 368: '🌨️',
        182: '🌧️', 185: '🌧️', 281: '🌧️', 284: '🌧️', 299: '🌧️', 302: '🌧️',
        305: '🌧️', 308: '🌧️', 311: '🌧️', 314: '🌧️', 317: '🌧️', 356: '🌧️',
        359: '🌧️', 362: '🌧️', 365: '🌧️', 374: '🌧️', 377: '🌧️',
        230: '❄️', 329: '❄️', 332: '❄️', 335: '❄️', 338: '❄️', 350: '❄️', 371: '❄️',
        200: '⛈️', 386: '⛈️', 389: '⛈️', 392: '⛈️', 395: '⛈️',
    };

    async function renderWeather() {
        const bar = document.getElementById('weather-bar');
        if (!bar) return;
        try {
            // wttr.in は CORS ヘッダーを返すのでクライアントから直接取得可能
            const res = await fetch('https://wttr.in/35.68,140.02?format=j1');
            const data = await res.json();
            bar.innerHTML = [0, 1].map(i => {
                const day = data.weather[i];
                const code = parseInt(day.hourly[4].weatherCode); // 正午のコード
                const icon = WTTR_ICON[code] ?? '🌡️';
                const hi = Math.round(parseFloat(day.maxtempC));
                const lo = Math.round(parseFloat(day.mintempC));
                return `<span class="weather-day"><span class="w-icon">${icon}</span><span class="w-temp">${hi}°/${lo}°</span></span>`;
            }).join('');
        } catch {
            // keep existing content on error; do not clear
        }
    }

    renderWeather();
    setInterval(renderWeather, 3600000); // 1時間ごとに更新
}());

// 出席登録ボタン
(function () {
    // 曜日(1=月〜5=金) → 授業スケジュール
    const ATTENDANCE_SCHEDULE = {
        1: [ // 月曜
            { start: '08:30', end: '10:00', room: 635 },
            { start: '10:30', end: '12:00', room: 635 },
            { start: '13:30', end: '15:00', room: '010201' },
        ],
        2: [ // 火曜
            { start: '08:30', end: '10:00', room: 635 },
            { start: '10:30', end: '12:00', room: 635 },
            { start: '13:30', end: '15:00', room: 635 },
        ],
        3: [ // 水曜
            { start: '08:30', end: '10:00', room: 431 },
            { start: '10:30', end: '12:00', room: 431 },
        ],
        4: [ // 木曜
            { start: '08:30', end: '10:00', room: 643 },
            { start: '10:30', end: '12:00', room: 632 },
        ],
        5: [ // 金曜
            { start: '09:30', end: '11:00', room: 632 },
            { start: '12:30', end: '14:00', room: '070104' },
        ],
    };

    function toMinutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    function renderAttendanceButton() {
        const bar = document.getElementById('attendance-bar');
        if (!bar) return;
        const now = new Date();
        const dow = now.getDay(); // 0=日, 1=月...6=土
        const current = now.getHours() * 60 + now.getMinutes();
        const slots = ATTENDANCE_SCHEDULE[dow] || [];
        const slot = slots.find(s => current >= toMinutes(s.start) && current <= toMinutes(s.end));
        if (slot) {
            bar.innerHTML = `<a href="https://attendance.is.it-chiba.ac.jp/attendance/class_room/${slot.room}" target="_blank" class="attendance-button">📋 出席登録</a>`;
        } else {
            bar.innerHTML = '';
        }
    }

    renderAttendanceButton();
    setInterval(renderAttendanceButton, 60000);
}());