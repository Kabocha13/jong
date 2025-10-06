// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container'); // 追加

// 除外するプレイヤー名を設定
const EXCLUDED_PLAYERS = ['3mahjong']; // 三麻用のダミー名やその他の除外したい名前を追加可能

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));


/**
 * データの取得とランキングの描画を行うメイン関数
 */
async function renderScores() {
    SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
    SPORTS_BETS_CONTAINER.innerHTML = '<p>くじデータを読み込み中...</p>'; // 追加
    
    // 1. データ取得
    const allData = await fetchAllData(); // 全データ取得に変更
    const rawScores = allData.scores;
    const sportsBets = allData.sports_bets || []; // 追加
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class=\"error\">データが見つからないか、JSONBinとの通信に失敗しました。JSONBinの初期データを確認してください。</p>';
        return;
    }

    // 2. 除外プレイヤーのフィルタリング
    // 画面表示とタイトル計算に使うデータから除外する
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
        
        // ローカルストレージに保存するマップを作成
        currentScoresMap.set(player.name, player.score);
        
        // HTML生成
        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-score">${scoreDisplay} P</span>
            </li>
        `;
    });
    
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;

    // 4. タイトルホルダーの描画
    renderTitles(sortedScores);
    
    // 5. くじタイルの描画 (修正: 汎用オッズの表示)
    renderSportsBets(sportsBets, displayScores);

    // 6. 最終更新日時の表示
    LAST_UPDATE_ELEMENT.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    // 7. 現在のスコアをローカルストレージに保存
    localStorage.setItem('previousScores', JSON.stringify(Array.from(currentScoresMap.entries())));
}

/**
 * スポーツくじのタイルを描画する関数 (修正: 汎用オッズの表示)
 * @param {Array<Object>} sportsBets - sports_betsデータ
 * @param {Array<Object>} displayScores - ランキングに表示されているプレイヤーのスコア
 */
function renderSportsBets(sportsBets, displayScores) {
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
        let myWagersMap = new Map(); // プレイヤーごとの選択肢と合計掛け金

        // 自分の投票情報を集計 (ランキングに表示されているプレイヤーのみ対象)
        bet.wagers.filter(w => playerNames.includes(w.player)).forEach(wager => {
            totalWagers += wager.amount;
            const currentAmount = myWagersMap.get(wager.selection) || 0;
            myWagersMap.set(wager.selection, currentAmount + wager.amount);
        });

        // 自分の投票情報HTMLを生成
        if (myWagersMap.size > 0) {
            myWagerInfo = `<p class="my-wager-text">✅ 合計賭け金: ${totalWagers} P</p>`;
            myWagerInfo += '<ul class="my-wagers-list">';
            myWagersMap.forEach((amount, selection) => {
                // selectionは選択肢名そのもの
                myWagerInfo += `<li>${selection}: ${amount} P</li>`;
            });
            myWagerInfo += '</ul>';
        } else {
            myWagerInfo = `<p class="my-wager-text">まだ投票されていません。</p>`;
        }
        
        
        // 汎用オッズを生成
        let genericOddsHtml = '';
        const genericOdds = bet.odds || {};
        if (Object.keys(genericOdds).length > 0) {
            genericOddsHtml += '<p class="score-odds-header">🏆 選択肢オッズ:</p><ul class="score-odds-list">';
            Object.entries(genericOdds).slice(0, 5).forEach(([selection, odds]) => { // 最大5つ表示
                genericOddsHtml += `<li>${selection}: <strong>x${odds.toFixed(1)}</strong></li>`;
            });
            if (Object.keys(genericOdds).length > 5) {
                genericOddsHtml += `<li>...他${Object.keys(genericOdds).length - 5}件</li>`;
            }
            genericOddsHtml += '</ul>';
        }

        const statusClass = bet.status === 'OPEN' ? 'status-open' : 'status-closed';
        const statusText = bet.status === 'OPEN' ? '【開催中】' : '【締切済み】';

        html += `
            <div class="bet-tile ${statusClass}">
                <h4>${statusText} ${bet.matchName} (#${bet.betId})</h4>
                <div class="odds-info-display">
                    ${genericOddsHtml}
                </div>
                ${myWagerInfo}
                <p class="total-wager-text">総賭け金: ${bet.wagers.reduce((sum, w) => sum + w.amount, 0)} P</p>
            </div>
        `;
    });
    
    html += '</div>';
    SPORTS_BETS_CONTAINER.innerHTML = html;
}

/**
 * 結果/選択肢のラベルを取得する (この関数はmaster_sports.jsから削除されたため、main.jsからも削除します)
 */
// function getOutcomeLabel(key) {
//     switch (key) {
//         case 'A_WIN': return 'A勝利';
//         case 'DRAW': return '引き分け';
//         case 'B_WIN': return 'B勝利';
//         default: return key; 
//     }
// }


// --- タイトル計算と描画 (既存コード) ---
function renderTitles(sortedScores) {
    const titles = [];

    if (sortedScores.length === 0) {
        TITLES_CONTAINER.innerHTML = '<p>プレイヤーデータがありません。</p>';
        return;
    }

    // 1. トップランカー (1位)
    const topPlayer = sortedScores[0];
    titles.push({ name: topPlayer.name, title: '頂点', icon: '👑' });

    // 2. 最下位の奮起 (最低ポイント)
    const bottomPlayer = sortedScores[sortedScores.length - 1];
    if (bottomPlayer.score < topPlayer.score) {
        titles.push({ name: bottomPlayer.name, title: 'カモ', icon: '🔥' });
    }
    
    // 3. 今日の波乗り (前回比で最もポイントを稼いだ人)
    let maxDiff = -Infinity;
    let waveRider = null;
    
    // ローカルストレージの前回スコアをマップとして取得
    const prevScoresMap = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));
    
    sortedScores.forEach(player => {
        const currentScore = player.score;
        // 前回スコアは、ローカルストレージ（フィルタリング済み）から取得
        const prevScore = prevScoresMap.get(player.name) || currentScore;
        const diff = currentScore - prevScore;
        
        if (diff > maxDiff && diff > 0.1) { // 0.1ポイント以上の変動があり、かつフィルタリングされたプレイヤー
            maxDiff = diff;
            waveRider = player.name;
        }
    });
    
    if (waveRider) {
        titles.push({ name: waveRider, title: '波乗り', icon: '🌊' });
    }

    // 描画
    let titleHtml = '<ul class=\"titles-list\">';
    titles.forEach(t => {
        titleHtml += `
            <li>
                <span class="title-icon">${t.icon}</span>
                <span class="title-text">${t.title} (${t.name})</span>
            </li>
        `;
    });
    titleHtml += '</ul>';
    TITLES_CONTAINER.innerHTML = titleHtml;
}

// 初期ロードとボタンイベント
window.onload = renderScores;

document.getElementById('refresh-button').addEventListener('click', renderScores);
