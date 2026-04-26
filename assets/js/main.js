// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
// 削除: const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
// ★★★ 新規追加: 宝くじコンテナ要素
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 
const TERRITORY_BATTLE_CONTAINER = document.getElementById('territory-battle-container');

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
    const territoryBattle = normalizeTerritoryBattle(allData.territory_battle);

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
    renderTerritoryBattle(territoryBattle, displayScores);
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

function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function getOwnerClass(owner, players) {
    if (!owner) return 'neutral';
    const index = Math.max(0, players.findIndex(player => player.name === owner));
    return `owner-${(index % 8) + 1}`;
}

function getTerritoryActionLabel(tile, playerName, battle) {
    if (!playerName) return '';
    const stats = getPlayerTerritoryStats(playerName, battle);
    const ownedIds = stats.tiles.map(t => t.id);
    if (tile.owner === playerName) return '強化';
    if (ownedIds.length === 0 && !tile.owner) return '本拠';
    const isAdjacent = getGridAdjacentTerritoryIds(tile.id).some(id => ownedIds.includes(id));
    if (isAdjacent) return tile.owner ? '攻撃' : '占領';
    return '';
}

function renderTerritoryBattle(battle, players) {
    if (!TERRITORY_BATTLE_CONTAINER) return;

    const normalized = normalizeTerritoryBattle(battle);
    const loginName = localStorage.getItem('authUsername') || '';
    const playerStats = loginName ? getPlayerTerritoryStats(loginName, normalized) : null;
    const leaders = players
        .map(player => ({
            name: player.name,
            ...getPlayerTerritoryStats(player.name, normalized)
        }))
        .filter(stat => stat.count > 0)
        .sort((a, b) => b.area - a.area || b.count - a.count)
        .slice(0, 5);

    const totalOccupied = normalized.tiles.filter(tile => tile.owner).length;
    const totalArea = normalized.tiles.reduce((sum, tile) => sum + (tile.owner ? tile.area : 0), 0);

    let html = `
        <div class="territory-shell">
            <div class="territory-status">
                <div>
                    <span class="territory-kicker">戦況</span>
                    <strong>${totalOccupied} / ${normalized.tiles.length} 区</strong>
                    <small>${totalArea.toFixed(1)} km² 制圧</small>
                </div>
                <div>
                    <span class="territory-kicker">自軍</span>
                    <strong>${loginName ? escapeText(loginName) : '未ログイン'}</strong>
                    <small>${playerStats ? `${playerStats.count}区 / ${playerStats.area.toFixed(1)}km² / -${playerStats.reduction.toFixed(1)}%` : 'マイページのログイン情報を使用'}</small>
                </div>
            </div>
            <div class="territory-layout">
                <div class="territory-map" aria-label="東京19区 陣取りマップ">
                    ${normalized.tiles.map(tile => {
                        const actionLabel = getTerritoryActionLabel(tile, loginName, normalized);
                        const meta = getTerritoryTileMeta(tile.id);
                        const positionStyle = meta ? ` style="grid-row:${meta.row};grid-column:${meta.col};"` : '';
                        return `
                            <button type="button" class="territory-tile ${getOwnerClass(tile.owner, players)}" data-territory-id="${tile.id}"${positionStyle}>
                                <span class="territory-ward">${tile.name.replace('区', '')}</span>
                                <span class="territory-owner">${tile.owner ? escapeText(tile.owner) : '中立'}</span>
                                <span class="territory-defense">${tile.defense.toFixed(1)} 防</span>
                                ${actionLabel ? `<span class="territory-action-badge">${actionLabel}</span>` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
                <div class="territory-command">
                    <h4>軍議</h4>
                    ${loginName ? `
                        <form id="territory-action-form">
                            <label for="territory-target">目標区</label>
                            <select id="territory-target" required>
                                <option value="" disabled selected>区を選択</option>
                                ${normalized.tiles.map(tile => `<option value="${tile.id}">${tile.name} / ${tile.owner || '中立'} / 防衛 ${tile.defense.toFixed(1)}P</option>`).join('')}
                            </select>
                            <label for="territory-points">投入ポイント</label>
                            <input type="number" id="territory-points" min="5" step="0.1" value="5" required>
                            <button type="submit" class="territory-submit">出陣</button>
                        </form>
                    ` : `
                        <div class="territory-login-prompt">
                            <p>出陣するにはログインが必要です。</p>
                            <a href="mypage.html" class="territory-login-button">ログイン</a>
                        </div>
                    `}
                    <p id="territory-message" class="territory-message hidden"></p>
                    <div class="territory-ranking">
                        <h4>勢力</h4>
                        ${leaders.length === 0 ? '<p>まだどの区も制圧されていません。</p>' : leaders.map((leader, index) => `
                            <div class="territory-rank-row">
                                <span>${index + 1}</span>
                                <strong>${escapeText(leader.name)}</strong>
                                <em>${leader.area.toFixed(1)}km² / -${leader.reduction.toFixed(1)}%</em>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    TERRITORY_BATTLE_CONTAINER.innerHTML = html;
    attachTerritoryHandlers();
}

function attachTerritoryHandlers() {
    const form = document.getElementById('territory-action-form');
    const select = document.getElementById('territory-target');
    if (!form || !select) return;

    TERRITORY_BATTLE_CONTAINER.querySelectorAll('.territory-tile').forEach(tileButton => {
        tileButton.addEventListener('click', () => {
            select.value = tileButton.dataset.territoryId;
            select.focus();
        });
    });

    form.addEventListener('submit', handleTerritoryAction);
}

async function handleTerritoryAction(e) {
    e.preventDefault();

    const messageEl = document.getElementById('territory-message');
    const targetId = document.getElementById('territory-target').value;
    const amount = parseFloat(document.getElementById('territory-points').value);
    const username = localStorage.getItem('authUsername');
    const password = localStorage.getItem('authPassword');
    const submitButton = e.target.querySelector('button[type="submit"]');

    if (!username || !password) {
        showMessage(messageEl, 'マイページでログインしてから出陣してください。', 'error');
        return;
    }
    if (!targetId || isNaN(amount) || amount < 5) {
        showMessage(messageEl, '5P以上を投入してください。', 'error');
        return;
    }

    submitButton.disabled = true;
    showMessage(messageEl, '出陣中...', 'info');

    try {
        const currentData = await fetchAllData();
        const scoresMap = new Map((currentData.scores || []).map(player => [player.name, player]));
        const player = scoresMap.get(username);

        if (!player || player.pass !== password) {
            showMessage(messageEl, 'ログイン情報を確認できませんでした。', 'error');
            return;
        }
        if ((player.score || 0) < amount) {
            showMessage(messageEl, `ポイント残高が不足しています。現在 ${player.score.toFixed(1)}P`, 'error');
            return;
        }

        const battle = normalizeTerritoryBattle(currentData.territory_battle);
        const tile = battle.tiles.find(t => t.id === targetId);
        if (!tile) {
            showMessage(messageEl, '目標区が見つかりません。', 'error');
            return;
        }

        const stats = getPlayerTerritoryStats(username, battle);
        const ownedIds = stats.tiles.map(t => t.id);
        const isOwnTile = tile.owner === username;
        const isFirstBase = ownedIds.length === 0 && !tile.owner;
        const isAdjacent = getGridAdjacentTerritoryIds(targetId).some(id => ownedIds.includes(id));

        if (!isOwnTile && !isFirstBase && !isAdjacent) {
            showMessage(messageEl, '隣接する区にのみ出陣できます。', 'error');
            return;
        }

        const previousOwner = tile.owner;
        let resultText = '';
        if (isOwnTile) {
            tile.defense = parseFloat((tile.defense + amount).toFixed(1));
            resultText = `${tile.name}を強化しました。`;
        } else if (amount > tile.defense) {
            tile.owner = username;
            tile.defense = parseFloat((amount * 0.7).toFixed(1));
            resultText = previousOwner ? `${tile.name}を奪取しました。` : `${tile.name}を制圧しました。`;
        } else {
            tile.defense = parseFloat(Math.max(0, tile.defense - amount * 0.5).toFixed(1));
            resultText = `${tile.name}の防衛力を削りました。`;
        }

        scoresMap.set(username, {
            ...player,
            score: parseFloat((player.score - amount).toFixed(1))
        });

        battle.updatedAt = new Date().toISOString();
        battle.actions = [
            ...(battle.actions || []),
            {
                at: battle.updatedAt,
                player: username,
                tileId: tile.id,
                tileName: tile.name,
                amount: parseFloat(amount.toFixed(1)),
                previousOwner,
                owner: tile.owner,
                result: resultText
            }
        ].slice(-30);

        const newData = {
            scores: Array.from(scoresMap.values()),
            sports_bets: currentData.sports_bets || [],
            speedstorm_records: currentData.speedstorm_records || [],
            lotteries: currentData.lotteries || [],
            gift_codes: currentData.gift_codes || [],
            exercise_reports: currentData.exercise_reports || [],
            career_posts: currentData.career_posts || [],
            territory_battle: battle
        };

        const response = await updateAllData(newData);
        if (response.status === 'success') {
            invalidateFetchCache();
            localStorage.removeItem(LS_DATA_KEY);
            showMessage(messageEl, `${resultText} ${amount.toFixed(1)}Pを消費しました。`, 'success');
            await renderScores();
        } else {
            showMessage(messageEl, `出陣エラー: ${response.message}`, 'error');
        }
    } catch (error) {
        console.error("陣取り処理中にエラー:", error);
        showMessage(messageEl, `サーバーエラー: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
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
            { start: '12:30', end: '14:00', room: 7111 },
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
