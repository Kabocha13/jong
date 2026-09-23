// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
// 削除: const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
// ★★★ 新規追加: 宝くじコンテナ要素
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const HOME_MANABA_ASSIGNMENT_LIST = document.getElementById('home-manaba-assignment-list');
const HOME_MANABA_MESSAGE = document.getElementById('home-manaba-message');
const REFRESH_BUTTON = document.getElementById('refresh-button');
const HOME_BONUS_BUTTON = document.getElementById('home-bonus-button');
const DECK_BAR = document.querySelector('.deck-bar');

const EXCLUDED_PLAYERS = [MAHJONG_CPU_NAME];  // CPU席はランキングに出さない (common.js で定義)
// 出席登録はこのレート以上でないと表示しない (基準レートと同じ値にしてある)
const ATTENDANCE_MIN_RATE = 3000;
let homeLatestScores = [];
const LS_DATA_KEY = 'cachedHomeData';
const HOME_MANABA_SYNC_INTERVAL_MS = 60 * 60 * 1000;
/**
 * データを受け取って全セクションを描画する
 */
function renderWithData(allData, isStale = false) {
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !LAST_UPDATE_ELEMENT || !LOTTERY_LIST_CONTAINER) return;

    const rawScores = allData.scores || [];
    homeLatestScores = rawScores;
    const sportsBets = allData.sports_bets || [];
    const lotteries = allData.lotteries || [];

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
                <span class="${nameClass}">${escapeText(player.name)} ${memberMark}</span>
                <span class="player-score">${formatRate(player.score)}</span>
            </li>`;
    });
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    renderSportsBets(sportsBets, displayScores);
    renderLotteries(lotteries);
    updateHomeBonusButton(rawScores);
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
            SCORES_CONTAINER.innerHTML = loadingSkeletonHtml(3, 'ランキングを読み込み中');
        }
    } else {
        SCORES_CONTAINER.innerHTML = loadingSkeletonHtml(3, 'ランキングを読み込み中');
        SPORTS_BETS_CONTAINER.innerHTML = loadingSkeletonHtml(1, 'くじデータを読み込み中');
        LOTTERY_LIST_CONTAINER.innerHTML = loadingSkeletonHtml(1, '宝くじデータを読み込み中');
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

function loadingSkeletonHtml(rows = 1, label = '読み込み中') {
    const rowsHtml = '<div class="skeleton skeleton-row"></div>'.repeat(rows);
    return `<div class="loading-placeholder" role="status" aria-label="${label}">${rowsHtml}</div>`;
}

function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

async function ensureHomeFirebaseLogin() {
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    if (!username || !password) return false;
    if (getCurrentFirebaseUidSync()) {
        await runDailyRateReversionIfNeeded().catch(error => {
            console.warn('日次レート補正に失敗しました。ホーム表示は継続します。', error);
        });
        return true;
    }

    try {
        await qjongSignIn(username, password);
        await runDailyRateReversionIfNeeded().catch(error => {
            console.warn('日次レート補正に失敗しました。ホーム表示は継続します。', error);
        });
        return true;
    } catch (error) {
        console.warn('ホームmanaba用ログインに失敗:', error);
        return false;
    }
}

async function renderHomeManabaAssignments() {
    if (!HOME_MANABA_ASSIGNMENT_LIST) return;

    const isLoggedIn = await ensureHomeFirebaseLogin();
    // ログインできたタイミングで、レート推移グラフが空のままなら作り直させる
    if (isLoggedIn) window.qjongRateChart?.healIfEmpty();
    if (!isLoggedIn) {
        HOME_MANABA_ASSIGNMENT_LIST.innerHTML = '<p class="info-text">マイページでログインすると未提出課題を表示できます。</p>';
        return;
    }

    try {
        const record = await fetchManabaAssignmentsFromFirebase();
        renderHomeManabaAssignmentTable(record || { assignments: [] });
        await syncHomeManabaIfStale(record);
    } catch (error) {
        HOME_MANABA_ASSIGNMENT_LIST.innerHTML = '<p class="error">manaba課題の読み込みに失敗しました。</p>';
    }
}

async function syncHomeManabaIfStale(record) {
    const credentials = await fetchManabaCredentialsFromFirebase();
    if (!credentials || !credentials.loginId || !credentials.password) return;

    const lastSynced = Date.parse(record?.lastSyncedAt || '');
    if (Number.isFinite(lastSynced) && Date.now() - lastSynced < HOME_MANABA_SYNC_INTERVAL_MS) return;
    await syncHomeManabaFromServer(false);
}

async function syncHomeManabaFromServer(showProgress) {
    if (showProgress) showMessage(HOME_MANABA_MESSAGE, 'manabaから取得中...', 'info');

    try {
        const data = await syncManabaAssignmentsNow();
        showMessage(HOME_MANABA_MESSAGE, `${data.count}件の未提出課題を取得しました。`, 'success');
        const record = await fetchManabaAssignmentsFromFirebase();
        renderHomeManabaAssignmentTable(record || { assignments: [] });
    } catch (error) {
        showMessage(HOME_MANABA_MESSAGE, `取得エラー: ${error.message}`, 'error');
    }
}

function renderHomeManabaAssignmentTable(record) {
    if (!HOME_MANABA_ASSIGNMENT_LIST) return;
    const assignments = [...(record.assignments || [])].sort((a, b) => {
        return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
    });
    const syncedAt = record.lastSyncedAt
        ? new Date(record.lastSyncedAt).toLocaleString('ja-JP')
        : '未取得';

    if (!assignments.length) {
        HOME_MANABA_ASSIGNMENT_LIST.innerHTML = `<p class="text-small">最終取得: ${escapeText(syncedAt)}</p><p class="info-text">未提出課題はありません。</p>`;
        return;
    }

    HOME_MANABA_ASSIGNMENT_LIST.innerHTML = `
        <p class="text-small">最終取得: ${escapeText(syncedAt)}</p>
        <div class="career-table-wrap">
            <table class="career-table manaba-assignment-table">
                <thead>
                    <tr>
                        <th>課題</th>
                        <th>授業</th>
                        <th>締切</th>
                        <th>リンク</th>
                    </tr>
                </thead>
                <tbody>
                    ${assignments.map(item => {
                        const urgentClass = isManabaAssignmentUrgent(item) ? ' class="manaba-assignment-urgent"' : '';
                        return `
                        <tr${urgentClass}>
                            <td data-label="課題">${escapeText(item.title || '名称未取得')}</td>
                            <td data-label="授業">${escapeText(item.course || '—')}</td>
                            <td data-label="締切">${escapeText(item.deadlineText || item.deadline || '—')}</td>
                            <td data-label="リンク">${item.url ? `<a class="career-link" href="${escapeText(item.url)}" target="_blank" rel="noopener">開く</a>` : '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
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
        prizesTable += '<thead><tr><th>等級</th><th>レート</th><th>確率</th></tr></thead>';
        prizesTable += '<tbody>';
        
        let totalProbability = 0;

        l.prizes.sort((a, b) => a.rank - b.rank); // ランク順にソート

        l.prizes.forEach(p => {
            prizesTable += `
                <tr>
                    <td>${p.rank}等</td>
                    <td>${formatRate(p.amount)}</td>
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
                <td>0</td>
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
                    <p class="bet-deadline">価格: <strong>${formatRate(l.ticketPrice)} レート/枚</strong></p>
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
            myWagerInfo = `<p class="my-wager-text">✅ 合計賭けレート: ${formatRate(totalWagers)}</p>`;
            myWagerInfo += '<ul class="my-wagers-list">';
            
            // プレイヤーごとの個別の賭けを表示
            playerWagers.forEach(wager => {
                const itemDisplay = wager.item.length > 30 ? wager.item.substring(0, 30) + '...' : wager.item;
                // 投票履歴はマイページで確認する形にするため、ここでは簡易表示に
                myWagerInfo += `<li>${itemDisplay} に ${formatRate(wager.amount)}</li>`;
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
                <p class="total-wager-text">総賭けレート: ${formatRate(bet.wagers.reduce((sum, w) => sum + w.amount, 0))}</p>
            </div>
        `;
    });
    
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}


// -----------------------------------------------------------------
// ログインボーナス (デッキバー)
//   マイページと同じ共通処理を呼ぶので、どちらから押しても挙動は同じ。
// -----------------------------------------------------------------

let homeBonusPlayer = null;

function updateHomeBonusButton(scores) {
    if (!HOME_BONUS_BUTTON) return;

    const loginName = localStorage.getItem('authUsername') || '';
    homeBonusPlayer = loginName ? (scores || []).find(p => p.name === loginName) || null : null;
    renderHomeBonusLabel();
}

/**
 * ペナルティ確率はボタン本体に出す。
 * スマホではツールチップが開けず、押すまで危険度が分からないため。
 */
function renderHomeBonusLabel() {
    if (!HOME_BONUS_BUTTON) return;

    if (!homeBonusPlayer) {
        // 未ログインでも枠は残して、押せない理由が分かるようにする
        HOME_BONUS_BUTTON.hidden = false;
        HOME_BONUS_BUTTON.disabled = true;
        HOME_BONUS_BUTTON.textContent = '未ログイン';
        HOME_BONUS_BUTTON.title = 'マイページでログインするとログインボーナスを受け取れます。';
        return;
    }

    const state = getRateBonusState(homeBonusPlayer);
    HOME_BONUS_BUTTON.hidden = false;
    HOME_BONUS_BUTTON.disabled = false;
    HOME_BONUS_BUTTON.textContent = `ログボ ペナ${Math.round(state.total)}%`;
    HOME_BONUS_BUTTON.title = `${state.memberLabel}会員 / 当たり +${state.bonusAmount} / 外れ -${RATE_BONUS_PENALTY}`;
}

HOME_BONUS_BUTTON?.addEventListener('click', async () => {
    if (!homeBonusPlayer) return;

    const playerName = homeBonusPlayer.name;
    HOME_BONUS_BUTTON.disabled = true;
    HOME_BONUS_BUTTON.setAttribute('aria-busy', 'true');
    HOME_BONUS_BUTTON.textContent = '受取中…';

    try {
        if (!await ensureHomeFirebaseLogin()) {
            showToast('マイページでログインするとボーナスを受け取れます。', 'error');
            return;
        }

        const result = await claimRateBonus(playerName);
        if (result.status !== 'success') {
            showToast(`❌ ${result.message}`, 'error');
            return;
        }

        triggerRateBonusAnimation(DECK_BAR, result.penaltyOccurred ? 'penalty' : 'success', getRateBonusFloatText(result));
        showToast(describeRateBonusResult(result), result.penaltyOccurred ? 'error' : 'success');
        await renderScores();
    } catch (error) {
        console.error('ボーナス受け取り中にエラー:', error);
        showToast(`❌ サーバーエラー: ${error.message}`, 'error');
    } finally {
        HOME_BONUS_BUTTON.disabled = false;
        HOME_BONUS_BUTTON.removeAttribute('aria-busy');
        // 押すとペナルティ確率が上がるので、ラベルは最新の状態から引き直す
        renderHomeBonusLabel();
    }
});


async function renderHomePage() {
    await Promise.all([
        renderScores(),
        renderHomeManabaAssignments()
    ]);
}

// 初期ロードとボタンイベント
window.onload = renderHomePage;

REFRESH_BUTTON?.addEventListener('click', async () => {
    const originalLabel = REFRESH_BUTTON.textContent;
    REFRESH_BUTTON.disabled = true;
    REFRESH_BUTTON.setAttribute('aria-busy', 'true');
    REFRESH_BUTTON.textContent = '更新中…';
    try {
        loadCafeteriaMenu();
        await renderScores();
        await window.qjongRateChart?.load();
        const isLoggedIn = await ensureHomeFirebaseLogin();
        if (isLoggedIn) {
            await syncHomeManabaFromServer(true);
        } else if (HOME_MANABA_ASSIGNMENT_LIST) {
            HOME_MANABA_ASSIGNMENT_LIST.innerHTML = '<p class="info-text">マイページでログインすると未提出課題を表示できます。</p>';
        }
    } finally {
        REFRESH_BUTTON.disabled = false;
        REFRESH_BUTTON.removeAttribute('aria-busy');
        REFRESH_BUTTON.textContent = originalLabel;
    }
});

// 食堂メニュー (毎回 PDF を取得しなおす)
const CAFETERIA_MENU_PDF_URL = 'https://www.cit-s.com/wp/wp-content/themes/cit/syokudo/t.pdf';

function loadCafeteriaMenu() {
    const frame = document.getElementById('tsudanuma-menu');
    const link = document.getElementById('tsudanuma-menu-link');
    if (!frame) return;

    // キャッシュを避けて常に最新のメニューを読み込む
    const url = `${CAFETERIA_MENU_PDF_URL}?t=${Date.now()}`;
    // #view=FitH で横幅に合わせて表示させる (対応しないビューアでは無視される)。
    // ツールバーとサイドパネルは狭い画面では邪魔なので畳む
    frame.src = `${url}#view=FitH&toolbar=0&navpanes=0`;
    if (link) link.href = url;
}

loadCafeteriaMenu();

// ヒーロー画像のダブルタップで音を鳴らす (隠し要素)
// 音源は assets/audio/ に置く。ファイルが無い場合は何も起きない。
(function () {
    const HERO_AUDIO_SRC = 'assets/audio/hero.mp3';
    const DOUBLE_TAP_MS = 400;       // 2回目までの猶予
    const DOUBLE_TAP_SLOP_PX = 40;   // 指のぶれをどこまで同じ位置とみなすか

    const hero = document.querySelector('header.hero');
    if (!hero) return;

    let audio = null;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    function toggleHeroSound() {
        // 最初にダブルタップされるまで mp3 は取りに行かない
        if (!audio) {
            audio = new Audio(HERO_AUDIO_SRC);
            audio.preload = 'none';
        }

        // 鳴っている最中のダブルタップは停止にする
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            return;
        }

        audio.currentTime = 0;
        audio.play().catch(error => {
            console.warn(`${HERO_AUDIO_SRC} を再生できませんでした:`, error);
        });
    }

    hero.addEventListener('click', event => {
        const now = Date.now();
        const isQuick = now - lastTapAt < DOUBLE_TAP_MS;
        const isSamePlace =
            Math.abs(event.clientX - lastTapX) < DOUBLE_TAP_SLOP_PX &&
            Math.abs(event.clientY - lastTapY) < DOUBLE_TAP_SLOP_PX;

        if (isQuick && isSamePlace) {
            // 3回目が次のダブルタップの1回目に化けないよう、ここで区切る
            lastTapAt = 0;
            toggleHeroSound();
            return;
        }

        lastTapAt = now;
        lastTapX = event.clientX;
        lastTapY = event.clientY;
    });
}());

// 出席登録ボタン
(function () {
    // 曜日(1=月〜4=木) → 授業スケジュール
    // 同じ授業が連続する時限は1コマに結合して記載（例: 6〜9限 = 14:00〜18:00）
    // 津田沼キャンパス: 1限 09:00 / 2限 10:00 / 3限 11:00 / 4限 12:00 / 5限 13:00
    //                   6限 14:00 / 7限 15:00 / 8限 16:00 / 9限 17:00 / 10限 18:00
    const ATTENDANCE_SCHEDULE = {
        1: [ // 月曜
            { name: 'ネットワーク・データ工学実験', start: '14:00', end: '18:00', room: 642 },
        ],
        2: [ // 火曜
            { name: '物理の世界と先端技術', start: '15:00', end: '17:00', room: 622 },
        ],
        3: [ // 水曜
            { name: '技術者倫理', start: '09:00', end: '11:00', room: 647 },
            { name: 'データベース工学', start: '12:00', end: '14:00', room: 647 },
            { name: 'デザインプロジェクト設計', start: '14:00', end: '16:00', room: 647 },
        ],
        4: [ // 木曜
            { name: 'データマイニング', start: '09:00', end: '11:00', room: 611 },
            { name: '国際社会論', start: '11:00', end: '13:00', room: 432 },
        ],
    };

    // 授業開始時刻の前後この分数だけリンクを表示する
    // （連続コマは1コマとみなすので、表示されるのは最初の時限の開始前後だけ）
    const ATTENDANCE_WINDOW_MINUTES = 30;

    // ユーザー別の例外: この時間帯だけ別の教室のリンクを出す (他の時間は全員共通)
    // キーはログイン名。大文字小文字の違いで設定が外れないよう、
    // キーは小文字で書き、参照時にも小文字化して照合する
    const ATTENDANCE_USER_OVERRIDES = {
        kosuke: [
            { day: 2, from: '14:30', to: '15:30', room: 646 },
        ],
        mahhii: [
            { day: 2, from: '14:30', to: '15:30', room: 646 },
        ],
    };

    function toMinutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    let attendanceAllowedUsers = null;

    async function loadAttendanceAllowedUsers() {
        if (attendanceAllowedUsers) return attendanceAllowedUsers;
        try {
            const allData = await fetchAllData();
            attendanceAllowedUsers = Array.isArray(allData.attendance_allowed_users)
                ? allData.attendance_allowed_users
                : [];
        } catch (error) {
            console.error('出席表示設定の取得に失敗:', error);
            attendanceAllowedUsers = [];
        }
        return attendanceAllowedUsers;
    }

    /**
     * 自分のレートを引く。ランキング描画で取得済みのスコアを使い回し、
     * まだ無いときだけ取りに行く (この関数は1分おきに呼ばれるため)。
     * 取れなかった場合は null を返し、呼び出し側では出席を止めない。
     */
    async function getLoginPlayerRate(loginName) {
        let player = homeLatestScores.find(p => p.name === loginName);
        if (!player) {
            try {
                const allData = await fetchAllData();
                player = (allData.scores || []).find(p => p.name === loginName);
            } catch (error) {
                console.error('レートの取得に失敗:', error);
                return null;
            }
        }
        return player ? normalizeRate(player.score) : null;
    }

    async function renderAttendanceButton() {
        const bar = document.getElementById('attendance-bar');
        if (!bar) return;
        const loginName = localStorage.getItem('authUsername') || '';
        const allowedUsers = await loadAttendanceAllowedUsers();
        if (!loginName || !allowedUsers.includes(loginName)) {
            bar.innerHTML = '';
            return;
        }

        const now = new Date();
        const dow = now.getDay(); // 0=日, 1=月...6=土
        const current = now.getHours() * 60 + now.getMinutes();
        const override = (ATTENDANCE_USER_OVERRIDES[String(loginName || '').toLowerCase()] || [])
            .find(o => o.day === dow && current >= toMinutes(o.from) && current <= toMinutes(o.to));
        const slots = ATTENDANCE_SCHEDULE[dow] || [];
        const slot = slots.find(s => Math.abs(current - toMinutes(s.start)) <= ATTENDANCE_WINDOW_MINUTES);
        const room = override ? override.room : (slot ? slot.room : null);
        if (!room) {
            bar.innerHTML = '';
            return;
        }

        // レート不足のときは授業時間外と同じく何も出さない
        const rate = await getLoginPlayerRate(loginName);
        if (rate !== null && rate < ATTENDANCE_MIN_RATE) {
            bar.innerHTML = '';
            return;
        }

        bar.innerHTML = `<a href="https://attendance.is.chibatech.ac.jp/attendance/class_room/${room}" target="_blank" class="attendance-button">📋 出席登録</a>`;
    }

    renderAttendanceButton();
    setInterval(renderAttendanceButton, 60000);
}());
