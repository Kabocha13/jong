// assets/js/main.js

const SCORES_CONTAINER = document.getElementById('scores-container');
const TITLES_CONTAINER = document.getElementById('titles-container');
const LAST_UPDATE_ELEMENT = document.getElementById('last-update');

// 除外するプレイヤー名を設定
const EXCLUDED_PLAYERS = ['3mahjong']; // 三麻用のダミー名やその他の除外したい名前を追加可能

let previousScores = new Map(JSON.parse(localStorage.getItem('previousScores') || '[]'));


/**
 * データの取得とランキングの描画を行うメイン関数
 */
async function renderScores() {
    SCORES_CONTAINER.innerHTML = '<p>データを読み込み中...</p>';
    
    // 1. データ取得
    const rawScores = await fetchScores();
    
    if (rawScores.length === 0) {
        SCORES_CONTAINER.innerHTML = '<p class="error">データが見つからないか、JSONBinとの通信に失敗しました。JSONBinの初期データを確認してください。</p>';
        return;
    }

    // 2. 除外プレイヤーのフィルタリング
    // 画面表示とタイトル計算に使うデータから除外する
    const displayScores = rawScores.filter(player => 
        !EXCLUDED_PLAYERS.includes(player.name)
    );

    // 3. ランキング処理
    const sortedScores = displayScores.sort((a, b) => b.score - a.score);
    
    let html = '<ul class="ranking-list">';
    
    const currentScoresMap = new Map();

    sortedScores.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        
        // ポイント変動の計算 (ローカルストレージに保存された前回のスコアと比較)
        const prevScore = previousScores.get(player.name) || player.score;
        const diff = player.score - prevScore;
        const diffHtml = diff === 0 
            ? '' 
            : `<span class="point-diff ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}</span>`;

        html += `
            <li class="${rankClass}">
                <span class="rank-icon">${rank}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-score">${player.score.toFixed(1)} P</span>
                ${diffHtml}
            </li>
        `;
        
        // 描画後、現在のスコアをMapに保存 (除外されたプレイヤーも含めて保存すると、次回の計算で除外が漏れる可能性があるため、今回は表示スコアのみを保存)
        currentScoresMap.set(player.name, player.score);
    });
    
    html += '</ul>';
    SCORES_CONTAINER.innerHTML = html;
    
    // 4. 次回比較のために、現在のスコアをローカルストレージに保存
    localStorage.setItem('previousScores', JSON.stringify(Array.from(currentScoresMap.entries())));
    // previousScores変数は、rawScoresから再構築
    previousScores = new Map(rawScores.map(p => [p.name, p.score]));


    // 5. タイトル機能の適用
    renderTitles(sortedScores); // フィルタリング済みのスコアを使用

    // 6. 更新日時の表示
    LAST_UPDATE_ELEMENT.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}


/**
 * 飽きないためのタイトル（バッジ）を計算・表示する関数
 * @param {Array} sortedScores - フィルタリング・ソート済みのスコアデータ
 */
function renderTitles(sortedScores) {
    if (sortedScores.length === 0) {
        TITLES_CONTAINER.innerHTML = '<p>タイトルを計算するプレイヤーがいません。</p>';
        return;
    }

    const titles = [];

    // 1. 総合最強 (最高ポイント)
    const topPlayer = sortedScores[0];
    titles.push({ name: topPlayer.name, title: '雀豪', icon: '👑' });

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
    let titleHtml = '<ul class="titles-list">';
    titles.forEach(t => {
        titleHtml += `
            <li>
                <span class="title-icon">${t.icon}</span>
                <span class="title-name">${t.title}</span>
                <span class="player-name-small">(${t.name})</span>
            </li>
        `;
    });
    titleHtml += '</ul>';
    TITLES_CONTAINER.innerHTML = titleHtml;
}


// イベントリスナー
document.getElementById('refresh-button').addEventListener('click', renderScores);

// 初回読み込み
renderScores();
