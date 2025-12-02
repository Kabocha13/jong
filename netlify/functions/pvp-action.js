// netlify/functions/pvp-action.js

const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ヘルパー関数: ルームコードを生成
function generateRoomCode() {
    // 6桁の英数字コードを生成
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ヘルパー関数: 12脚の秘密用椅子を初期化 (isShockを含む)
function initializeSecretChairs() {
    const chairs = [];
    for (let i = 1; i <= 12; i++) {
        chairs.push({ id: i, available: true, isShock: false });
    }
    return chairs;
}

// ヘルパー関数: 12脚の公開用椅子を初期化 (isShockを含まない)
function initializePublicChairs() {
    const chairs = [];
    for (let i = 1; i <= 12; i++) {
        chairs.push({ id: i, available: true });
    }
    return chairs;
}


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, gameId, roomCode, actionToken, player, input, pointsConfig } = JSON.parse(event.body);

        if (!player || !action) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing required parameters: player or action' }) };
        }

        // 1. JSONBinから全データを取得
        let dataResponse = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });
        if (!dataResponse.ok) throw new Error(`JSONBin Fetch Error: ${dataResponse.statusText}`);
        
        const allData = (await dataResponse.json()).record;
        let allGames = allData.electric_chair_games || [];
        let allScoresMap = new Map(allData.scores.map(s => [s.name, s]));


        // 2. アクションに応じて処理を分岐
        let gameIndex = -1;
        let currentGame = null;
        let responseMessage = 'Action completed.';

        if (gameId) {
            gameIndex = allGames.findIndex(g => g.gameId === gameId);
            if (gameIndex !== -1) {
                currentGame = allGames[gameIndex];
            }
        } else if (roomCode) {
            gameIndex = allGames.findIndex(g => g.roomCode === roomCode);
            if (gameIndex !== -1) {
                currentGame = allGames[gameIndex];
            }
        }
        
        // --- 排他制御 (Action Token) ---
        // 'create'以外のアクションで、トークンが一致しない場合はエラー
        if (action !== 'create' && currentGame && currentGame.actionToken !== actionToken) {
             return { statusCode: 409, body: JSON.stringify({ message: 'データが古いです。UIを更新して再度お試しください。' }) };
        }

        // 新しいアクションごとにトークンを更新
        const newActionToken = generateRoomCode() + Date.now();
        const now = new Date().toISOString();
        
        // スコアを更新したかどうか
        let scoreUpdated = false;


        // === A. ルーム作成 (create) ===
        if (action === 'create') {
            
            // ★追加: ポイント設定の検証と取得
            const defaultPoints = { winPoints: 20.0, losePoints: -10.0, forfeitPoints: -10.0 };
            const finalPoints = {
                winPoints: pointsConfig && !isNaN(pointsConfig.winPoints) ? parseFloat(pointsConfig.winPoints.toFixed(1)) : defaultPoints.winPoints,
                losePoints: pointsConfig && !isNaN(pointsConfig.losePoints) ? parseFloat(pointsConfig.losePoints.toFixed(1)) : defaultPoints.losePoints,
                forfeitPoints: pointsConfig && !isNaN(pointsConfig.forfeitPoints) ? parseFloat(pointsConfig.forfeitPoints.toFixed(1)) : defaultPoints.forfeitPoints,
            };

            const newGameId = allGames.length > 0 ? Math.max(...allGames.map(g => g.gameId)) + 1 : 1;
            const newRoomCode = generateRoomCode();

            const newGame = {
                gameId: newGameId,
                roomCode: newRoomCode,
                playerA: player,
                playerB: null,
                status: 'WAITING_JOIN',
                nextActionPlayer: null,
                round: 1, // アクション回数 1 (初期状態)
                scoreA: 0,
                scoreB: 0,
                shockCountA: 0,
                shockCountB: 0,
                publicChairs: initializePublicChairs(),
                secretChairs: initializeSecretChairs(), 
                winner: null,
                timestamp: now,
                actionToken: newActionToken,
                lastResult: null,
                // ★追加: プレイヤーが設定したポイント
                winPoints: finalPoints.winPoints, 
                losePoints: finalPoints.losePoints, 
                forfeitPoints: finalPoints.forfeitPoints, 
            };

            allGames.push(newGame);
            responseMessage = `Room created. Code: ${newRoomCode}`;
            currentGame = newGame;
        }

        // === B. ルーム参加 (join) ===
        else if (action === 'join') {
            if (!currentGame || currentGame.status !== 'WAITING_JOIN' || currentGame.playerB || currentGame.playerA === player) {
                return { statusCode: 400, body: JSON.stringify({ message: 'Room not found, invalid status, or you are already the room creator.' }) };
            }

            // プレイヤーAとBをランダムで決定し、攻守を設定
            const players = [currentGame.playerA, player];
            const startingPlayer = players[Math.floor(Math.random() * 2)];
            // WAITING_A: Aが仕掛ける番 
            // WAITING_B: Bが仕掛ける番 
            const startingStatus = startingPlayer === currentGame.playerA ? 'WAITING_A' : 'WAITING_B';

            currentGame.playerB = player;
            currentGame.status = startingStatus;
            currentGame.nextActionPlayer = startingPlayer;
            currentGame.actionToken = newActionToken;
            
            responseMessage = `${player} joined. Starting game.`;
        }

        // === C. 電流を仕掛ける (setShockChair) ===
        else if (action === 'setShockChair') {
            if (!currentGame || currentGame.status === 'FINISHED') {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Game is not active.' }) };
            }
            const chairId = parseInt(input);
            const isAttacker = (currentGame.nextActionPlayer === player);
            const isPlayerA = currentGame.playerA === player;
            const isWaitingA = currentGame.status === 'WAITING_A';

            if (!isAttacker || (isPlayerA && !isWaitingA) || (!isPlayerA && isWaitingA)) {
                 return { statusCode: 403, body: JSON.stringify({ message: 'It is not your turn to set a shock, or you are not the attacker.' }) };
            }
            if (chairId < 1 || chairId > 12) {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Invalid chair ID.' }) };
            }
            
            // ★修正: Cの条件（椅子不足による強制終了）を削除。

            
            const selectedChair = currentGame.secretChairs.find(c => c.id === chairId);
            const publicChair = currentGame.publicChairs.find(c => c.id === chairId);
            
            if (!selectedChair || !selectedChair.available || !publicChair || !publicChair.available) {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Chair is already taken.' }) };
            }
            
            // ★修正: Bの条件（ラウンド終了による勝敗）の変更
            // 11回アクション完了後（6ラウンド目の仕掛け時）、仕掛けるアクションが成功した直後にゲーム終了判定を行う
            if (currentGame.round === 11) { // 11回目（最後の仕掛け）
                
                // 秘密情報に電流をセット (最後の仕掛けは確定させる)
                currentGame.secretChairs.forEach(c => c.isShock = (c.id === chairId)); 
                
                // 11アクション完了時の勝敗判定 (ここで最終スコア勝負)
                let winner = null;
                let loser = null;
                
                // スコアで勝敗を決定
                if (currentGame.scoreA > currentGame.scoreB) {
                    winner = currentGame.playerA;
                    loser = currentGame.playerB;
                } else if (currentGame.scoreB > currentGame.scoreA) {
                    winner = currentGame.playerB;
                    loser = currentGame.playerA;
                } else {
                    winner = 'DRAW';
                }
                
                if (winner) {
                    currentGame.round = 12; // アクション回数を12に更新 (最終アクション完了として扱う)
                    currentGame.status = 'FINISHED';
                    currentGame.nextActionPlayer = null;
                    currentGame.winner = winner;
                    
                    // ポイント反映
                    const WIN_POINTS = currentGame.winPoints;
                    const LOSE_POINTS = currentGame.losePoints;

                    if (winner !== 'DRAW') {
                        const winnerData = allScoresMap.get(winner);
                        const loserData = allScoresMap.get(loser);

                        if (winnerData) {
                             winnerData.score = parseFloat((winnerData.score + WIN_POINTS).toFixed(1));
                             allScoresMap.set(winner, winnerData);
                        }
                        if (loserData) {
                             loserData.score = parseFloat((loserData.score + LOSE_POINTS).toFixed(1));
                             allScoresMap.set(loser, loserData);
                        }
                        responseMessage = `Game Finished (Round Over)! ${winner} wins. (+${WIN_POINTS} P / ${loser} ${LOSE_POINTS} P)`;
                    } else {
                        responseMessage = `Game Finished (Round Over)! Draw.`;
                    }
                    scoreUpdated = true;
                    allData.scores = Array.from(allScoresMap.values());
                }
                
                currentGame.actionToken = newActionToken; // 最後にトークンを更新
                
                // 3. JSONBinに全データを上書き保存
                allData.electric_chair_games = allGames; 

                const putResponse = await fetch(JSONBIN_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
                    body: JSON.stringify(allData)
                });

                if (!putResponse.ok) throw new Error(`JSONBin PUT Error: ${putResponse.statusText}`);

                // 4. クライアントに成功応答を返す
                const publicGameForResponse = {
                    gameId: currentGame.gameId,
                    roomCode: currentGame.roomCode,
                    playerA: currentGame.playerA,
                    playerB: currentGame.playerB,
                    status: currentGame.status,
                    nextActionPlayer: currentGame.nextActionPlayer,
                    round: currentGame.round,
                    scoreA: currentGame.scoreA,
                    scoreB: currentGame.scoreB,
                    shockCountA: currentGame.shockCountA,
                    shockCountB: currentGame.shockCountB,
                    publicChairs: currentGame.publicChairs,
                    winner: currentGame.winner,
                    actionToken: currentGame.actionToken,
                    lastResult: currentGame.lastResult,
                    winPoints: currentGame.winPoints,
                    losePoints: currentGame.losePoints,
                    forfeitPoints: currentGame.forfeitPoints,
                };

                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        status: 'success',
                        message: responseMessage,
                        gameData: publicGameForResponse, // ★ FINISHED状態のデータを返す
                        actionToken: newActionToken,
                    })
                };
            }
            // ★修正終わり

            // 秘密情報に電流をセット
            currentGame.secretChairs.forEach(c => c.isShock = (c.id === chairId)); 
            
            // 次のターンは座るフェーズ
            currentGame.status = isPlayerA ? 'WAITING_B_SIT' : 'WAITING_A_SIT'; 
            currentGame.nextActionPlayer = isPlayerA ? currentGame.playerB : currentGame.playerA;

            currentGame.actionToken = newActionToken;
            responseMessage = `Shock set on chair ${chairId}. Waiting for ${currentGame.nextActionPlayer} to sit.`;
        }

        // === D. 椅子に座る (chooseChair) ===
        else if (action === 'chooseChair') {
             if (!currentGame || currentGame.status === 'FINISHED') {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Game is not active.' }) };
            }
            const chairId = parseInt(input);
            const isDefender = (currentGame.nextActionPlayer === player);
            const isPlayerA = currentGame.playerA === player;
            
            // 座るフェーズのステータス検証
            const isWaitingBSit = currentGame.status === 'WAITING_B_SIT'; 
            const isWaitingASit = currentGame.status === 'WAITING_A_SIT'; 

            if (!isDefender || (isPlayerA && !isWaitingASit) || (!isPlayerA && !isWaitingBSit)) {
                 return { statusCode: 403, body: JSON.stringify({ message: 'It is not your turn to choose a chair, or you are the attacker.' }) };
            }
            if (chairId < 1 || chairId > 12) {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Invalid chair ID.' }) };
            }
            
            const secretChair = currentGame.secretChairs.find(c => c.id === chairId);
            const publicChair = currentGame.publicChairs.find(c => c.id === chairId);

            if (!secretChair || !secretChair.available || !publicChair || !publicChair.available) {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Chair is already taken.' }) };
            }

            const isShock = secretChair.isShock;
            const points = chairId;
            let result = '';

            // 1. スコア/ショックカウントの更新
            if (isPlayerA) { // Aが座る側
                if (isShock) {
                    currentGame.shockCountA += 1;
                    currentGame.scoreA = 0; // スコア没収
                    result = 'SHOCK';
                } else {
                    currentGame.scoreA += points;
                    result = 'SAFE';
                }
            } else { // Bが座る側
                 if (isShock) {
                    currentGame.shockCountB += 1;
                    currentGame.scoreB = 0; // スコア没収
                    result = 'SHOCK';
                } else {
                    currentGame.scoreB += points;
                    result = 'SAFE';
                }
            }
            
            // 2. 椅子の状態を更新 (公開/秘密の両方)
            secretChair.available = false;
            publicChair.available = false;

            // 3. ラウンド情報の更新と攻守交替
            currentGame.round += 1; // アクション回数をインクリメント
            
            // 秘密情報をクリア (次のラウンドの仕掛けに備える)
            currentGame.secretChairs.forEach(c => c.isShock = false); 
            
            // 次のターンは、今回の仕掛け側ではない方がアタッカーになる
            const currentAttacker = isWaitingASit ? currentGame.playerB : currentGame.playerA; 
            const newAttacker = currentAttacker === currentGame.playerA ? currentGame.playerB : currentGame.playerA; 
            
            // 次のターンは、新しいアタッカーが仕掛ける番
            const isNewAttackerA = newAttacker === currentGame.playerA;
            currentGame.status = isNewAttackerA ? 'WAITING_A' : 'WAITING_B';
            currentGame.nextActionPlayer = newAttacker;

            // 直前の結果を記録
            currentGame.lastResult = {
                player: player,
                result: result,
                points: isShock ? (isPlayerA ? currentGame.shockCountA * -1 : currentGame.shockCountB * -1) : points
            };

            responseMessage = `Chair ${chairId} chosen. Result: ${result}.`;


            // 4. 終了条件判定
            let winner = null;
            let loser = null;
            if (currentGame.shockCountA >= 3) {
                winner = currentGame.playerB;
                loser = currentGame.playerA;
            } else if (currentGame.shockCountB >= 3) {
                winner = currentGame.playerA;
                loser = currentGame.playerB;
            } 
            // ★修正: 12回ではなく、12回以上のアクションでは勝敗判定を行わない。
            // 11回で勝敗が確定しているため、ここでは感電敗北のみをチェック。
            // 既にround <= 12の範囲で感電による敗北がなければ、次のsetShockChairで最終判定に進む。

            if (winner) {
                currentGame.status = 'FINISHED';
                currentGame.nextActionPlayer = null;
                currentGame.winner = winner;
                
                // ポイント反映 (ルーム作成時の設定値を使用)
                const WIN_POINTS = currentGame.winPoints;
                const LOSE_POINTS = currentGame.losePoints;

                if (winner !== 'DRAW') {
                    const winnerData = allScoresMap.get(winner);
                    const loserData = allScoresMap.get(loser);

                    if (winnerData) {
                         winnerData.score = parseFloat((winnerData.score + WIN_POINTS).toFixed(1));
                         allScoresMap.set(winner, winnerData);
                    }
                    if (loserData) {
                         // 敗北ポイントはマイナス値の想定
                         loserData.score = parseFloat((loserData.score + LOSE_POINTS).toFixed(1));
                         allScoresMap.set(loser, loserData);
                    }
                    responseMessage = `Game Finished! ${winner} wins. (+${WIN_POINTS} P / ${loser} ${LOSE_POINTS} P)`;
                } else {
                    responseMessage = `Game Finished! Draw.`;
                }
                scoreUpdated = true;
            }
            
            if (scoreUpdated) {
                 allData.scores = Array.from(allScoresMap.values());
            }
            
            currentGame.actionToken = newActionToken; 
        }
        
        // === E. ゲーム放棄/削除 (forfeit/delete) ===
        else if (action === 'forfeit' || action === 'delete') {
            if (!currentGame) {
                 return { statusCode: 400, body: JSON.stringify({ message: 'Game not found.' }) };
            }
            
            if (action === 'forfeit') {
                if (currentGame.status === 'FINISHED') {
                    responseMessage = 'Game already finished. Preparing to delete log.';
                } else {
                    // 放棄処理
                    const winner = currentGame.playerA === player ? currentGame.playerB : currentGame.playerA;
                    const loser = player;
                    // ★修正: 放棄ペナルティもルーム設定値を使用
                    const WIN_POINTS = currentGame.winPoints; 
                    const FORFEIT_PENALTY = currentGame.forfeitPoints; 
                    
                    const winnerData = allScoresMap.get(winner);
                    const loserData = allScoresMap.get(loser);

                    if (winnerData) {
                         // 勝利ポイントは相手がもらう
                         winnerData.score = parseFloat((winnerData.score + WIN_POINTS).toFixed(1));
                         allScoresMap.set(winner, winnerData);
                    }
                    if (loserData) {
                         // 放棄した人がペナルティを受ける
                         loserData.score = parseFloat((loserData.score + FORFEIT_PENALTY).toFixed(1));
                         allScoresMap.set(loser, loserData);
                    }
                    
                    currentGame.status = 'FINISHED';
                    currentGame.nextActionPlayer = null;
                    currentGame.winner = winner;
                    responseMessage = `Game forfeited. ${winner} wins. (+${WIN_POINTS} P / ${loser} ${FORFEIT_PENALTY} P)`;
                    scoreUpdated = true;
                    
                    // スコアの更新を反映
                    allData.scores = Array.from(allScoresMap.values());
                }
            }

            // 終了済みゲームはリストから削除
            allGames = allGames.filter(g => g.gameId !== currentGame.gameId);
            responseMessage = `Game log deleted.`;
            currentGame = null; 
        }
        
        else {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid action.' }) };
        }


        // 3. JSONBinに全データを上書き保存
        allData.electric_chair_games = allGames; 

        const putResponse = await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
            body: JSON.stringify(allData)
        });

        if (!putResponse.ok) throw new Error(`JSONBin PUT Error: ${putResponse.statusText}`);


        // 4. クライアントに成功応答を返す
        const publicGameForResponse = currentGame ? {
            gameId: currentGame.gameId,
            roomCode: currentGame.roomCode,
            playerA: currentGame.playerA,
            playerB: currentGame.playerB,
            status: currentGame.status,
            nextActionPlayer: currentGame.nextActionPlayer,
            round: currentGame.round,
            scoreA: currentGame.scoreA,
            scoreB: currentGame.scoreB,
            shockCountA: currentGame.shockCountA,
            shockCountB: currentGame.shockCountB,
            publicChairs: currentGame.publicChairs,
            winner: currentGame.winner,
            actionToken: currentGame.actionToken,
            lastResult: currentGame.lastResult,
            // ★追加: ポイント設定をレスポンスに含める
            winPoints: currentGame.winPoints,
            losePoints: currentGame.losePoints,
            forfeitPoints: currentGame.forfeitPoints,
        } : null;

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: 'success',
                message: responseMessage,
                gameData: publicGameForResponse,
                actionToken: newActionToken,
                // chooseChairアクションのみ、結果を即座に返す
                shockResult: action === 'chooseChair' ? { 
                    result: result, 
                    points: points, 
                    scoreA: currentGame.scoreA, 
                    scoreB: currentGame.scoreB 
                } : null
            })
        };

    } catch (error) {
        console.error(`PVP Action Error: ${error.message}`);
        return {
            statusCode: 500,
            body: JSON.stringify({ status: "error", message: `Server Error: ${error.message}` })
        };
    }
};
