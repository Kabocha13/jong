// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
// 削除: const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
// ★★★ 新規追加: 宝くじコンテナ要素
const LOTTERY_LIST_CONTAINER = document.getElementById('lottery-list-container'); 

const EXCLUDED_PLAYERS = ['3mahjong']; // 三麻用のダミー名やその他の除外したい名前を追加可能

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));


/**
 * データの取得とランキングの描画を行うメイン関数
 */
async function renderScores() {
    // ★ 修正: 致命的な要素がない場合の早期リターンを追加 (LOTTERY_LIST_CONTAINERのチェックを追加)
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !LAST_UPDATE_ELEMENT || !LOTTERY_LIST_CONTAINER) {
        console.error("致命的なHTML要素の一部が見つかりませんでした。レンダリングを停止します。");
        // エラーを避けるため、後続の処理を停止
        return; 
    }

    SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
    SPORTS_BETS_CONTAINER.innerHTML = '<p>くじデータを読み込み中...</p>';
    // ★ ロードメッセージを設定
    LOTTERY_LIST_CONTAINER.innerHTML = '<p>宝くじデータを読み込み中...</p>'; 
    // 削除: TITLES_CONTAINERの初期化を削除

    // 1. データ取得
    const allData = await fetchAllData(); // 全データ取得
    const rawScores = allData.scores;
    const sportsBets = allData.sports_bets || []; 
    const lotteries = allData.lotteries || [];
    const products = allData.product || [];
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class="error">データが見つからないか、JSONBinとの通信に失敗しました。JSONBinの初期データを確認してください。</p>';
        return;
    }

    // 2. 除外プレイヤーのフィルタリング
    const displayScores = rawScores.filter(player => 
        !EXCLUDED_PLAYERS.includes(player.name)
    );

    // 3. ランキング処理
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '<ul class=\"ranking-list\">';
    
    const currentScoresMap = new Map();

    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
        const scoreDisplay = player.score.toFixed(1);
        
        // ★★★ 修正: statusフィールドに基づいてマークと名前クラスを動的に決定 (Luxury対応) ★★★
        let memberMark = '';
        let nameClass = 'player-name';
        
        if (player.status === 'luxury') {
            memberMark = '<span class="luxury-mark" title="ラグジュアリー会員">💎</span>';
            nameClass += ' luxury-name'; // 高級感のあるフォントを適用
        } else if (player.status === 'premium') {
            memberMark = '<span class="premium-mark" title="プレミアム会員">👑</span>';
        } else if (player.status === 'pro') {
            memberMark = '<span class="pro-mark" title="プロ会員">⭐</span>';
        }

        currentScoresMap.set(player.name, player.score);
        
        // HTML生成
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

    // 4. タイトルホルダーの描画 (削除されたためスキップ)
    // renderTitles(sortedScores);
    
    // 5. くじタイルの描画
    renderSportsBets(sportsBets, displayScores);
    
    // 6. 宝くじの描画
    renderLotteries(lotteries);

    // 7. 交換商品の描画
    renderProducts(products);
    
    // 7. 最終更新日時の表示
    LAST_UPDATE_ELEMENT.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    // 9. 現在のスコアをローカルストレージに保存
    localStorage.setItem('previousScores', JSON.stringify(Array.from(currentScoresMap.entries())));
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
            <div class="bet-tile status-open">
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

/**
 * 交換商品リストを描画する関数
 * @param {Array<Object>} products - product データ [{name, money}, ...]
 */
function renderProducts(products) {
    const container = document.getElementById('product-list-container');
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = '<p class="info-text">交換商品データがありません。</p>';
        return;
    }

    let html = '<ul class="product-list">';
    products.forEach(p => {
        html += `<li class="product-item">
            <span class="product-name">${p.name}</span>
            <span class="product-price">${p.money}</span>
        </li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
}

document.getElementById('refresh-button').addEventListener('click', renderScores);

// 食堂リアルタイムカメラ
function getCameraTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function refreshCafeteriaCamera() {
    const img = document.getElementById('tsudanuma');
    if (img) {
        img.src = `https://www.cit-s.com/i_catch/dining/tsudanuma.jpg?${getCameraTimestamp()}`;
    }
}

// 初回タイムスタンプ付きで設定
refreshCafeteriaCamera();
setInterval(refreshCafeteriaCamera, 60000);