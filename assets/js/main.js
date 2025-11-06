// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
// 削除: const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');
const SPORTS_BETS_CONTAINER = document.getElementById('sports-bets-container');
// ★ 新規追加要素
const RACE_RECORDS_LIST = document.getElementById('race-records-list'); 

const EXCLUDED_PLAYERS = ['3mahjong']; // 三麻用のダミー名やその他の除外したい名前を追加可能

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));


/**
 * データの取得とランキングの描画を行うメイン関数
 */
async function renderScores() {
    // ★ 修正: 致命的な要素がない場合の早期リターンを追加
    if (!SCORES_CONTAINER || !SPORTS_BETS_CONTAINER || !RACE_RECORDS_LIST || !LAST_UPDATE_ELEMENT) {
        console.error("致命的なHTML要素の一部が見つかりませんでした。レンダリングを停止します。");
        // エラーを避けるため、後続の処理を停止
        return; 
    }

    SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
    SPORTS_BETS_CONTAINER.innerHTML = '<p>くじデータを読み込み中...</p>';
    RACE_RECORDS_LIST.innerHTML = '<li>記録条件:ローカルフリー　ベリーハード　CPU7　ラップ1　超高速</li><p>記録を読み込み中...</p>'; // ★ ロードメッセージを設定
    // 削除: TITLES_CONTAINERの初期化を削除

    // 1. データ取得
    const allData = await fetchAllData(); // 全データ取得
    const rawScores = allData.scores;
    const sportsBets = allData.sports_bets || []; 
    const raceRecords = allData.speedstorm_records || []; // ★ レース記録を取得
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class=\"error\">データが見つからないか、JSONBinとの通信に失敗しました。JSONBinの初期データを確認してください。</p>';
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
        
        // ★ proステータスをチェックし、マークを追加
        const proMark = player.pro ? '<span class="pro-mark" title="プロプレイヤー">⭐</span>' : '';

        currentScoresMap.set(player.name, player.score);
        
        // HTML生成
        html += `
            <li class="ranking-item ${rankClass}">
                <span class="rank-num">#${rank}</span>
                <span class="player-name">${player.name} ${proMark}</span>
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
    
    // 6. ★ 新規追加: レース記録の描画
    renderRaceRecords(raceRecords);

    // 7. 最終更新日時の表示
    LAST_UPDATE_ELEMENT.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    // 8. 現在のスコアをローカルストレージに保存
    localStorage.setItem('previousScores', JSON.stringify(Array.from(currentScoresMap.entries())));
}

/**
 * ★ 新規追加: スピードストーム レース記録を描画する関数
 * @param {Array<Object>} raceRecords - speedstorm_recordsデータ
 */
function renderRaceRecords(raceRecords) {
    if (!RACE_RECORDS_LIST) return; // ★ 修正: nullチェックを追加
    
    let html = '<li>記録条件:ローカルフリー　ベリーハード　CPU7　ラップ1　超高速</li>';

    if (raceRecords.length === 0) {
        html += '<li><p class="info-text" style="color: #6c757d; margin-top: 10px;">まだ記録が登録されていません。</p></li>';
    } else {
        // コースをカテゴリ（テーマ）ごとにグループ化して表示
        const groupedRecords = raceRecords.reduce((groups, record) => {
            // 例: "メインホール (キャッスル)" -> "キャッスル" をグループキーとして抽出
            const match = record.courseName.match(/\((.+?)\)/);
            const groupKey = match ? match[1] : 'その他';
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(record);
            return groups;
        }, {});

        // グループごとにHTMLを生成
        Object.entries(groupedRecords).forEach(([groupName, records]) => {
            html += `<li><strong style="display: block; margin-top: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 3px;">------${groupName}------</strong></li>`;
            
            records.forEach(record => {
                const timeDisplay = record.bestTime;
                // コース名から (グループ名) の部分を除去して表示
                const cleanCourseName = record.courseName.replace(/\s*\(.+?\)\s*$/, '');

                html += `
                    <li style="display: flex; justify-content: space-between; padding-left: 20px;">
                        <span>${cleanCourseName}:</span>
                        <span style="font-weight: bold; color: #dc3545;">${timeDisplay}</span>
                        <span style="font-size: 0.8em; color: #6c757d;">by ${record.holder}</span>
                    </li>
                `;
            });
        });
    }

    RACE_RECORDS_LIST.innerHTML = html;
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
