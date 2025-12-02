// netlify/functions/pvp-fetch.js

const API_KEY = process.env.JSONBIN_API_KEY;
const BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// サーバーサイドでゲームデータをフィルタリング・マスクする
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const playerName = event.queryStringParameters.player;
    if (!playerName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Player name is required.' }) };
    }

    try {
        // 1. JSONBinから全データを取得
        const response = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': API_KEY }
        });

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `JSONBin Fetch Error: ${response.statusText}` })
            };
        }

        const data = await response.json();
        // electric_chair_gamesフィールドを初期化
        const allGames = data.record.electric_chair_games || []; 
        const allScores = data.record.scores || []; // スコア情報も必要

        // 2. プレイヤーの状態に基づいてゲームをフィルタリング
        let currentGames = [];
        let availableGames = [];
        const now = new Date().toISOString();

        allGames.forEach(game => {
            // 秘密情報をマスクした公開用ゲームオブジェクトを生成
            const publicGame = {
                gameId: game.gameId,
                roomCode: game.roomCode,
                playerA: game.playerA,
                playerB: game.playerB,
                status: game.status,
                nextActionPlayer: game.nextActionPlayer,
                round: game.round,
                scoreA: game.scoreA,
                scoreB: game.scoreB,
                shockCountA: game.shockCountA,
                shockCountB: game.shockCountB,
                publicChairs: game.publicChairs, // publicChairsは公開
                winner: game.winner,
                timestamp: game.timestamp,
                actionToken: game.actionToken,
                // 直前の判定結果をマスクして含める
                lastResult: game.lastResult ? {
                    player: game.lastResult.player,
                    result: game.lastResult.result, // 'SHOCK' or 'SAFE'
                    points: game.lastResult.points
                } : null,
                // ポイント設定も公開
                winPoints: game.winPoints, 
                losePoints: game.losePoints, 
                forfeitPoints: game.forfeitPoints, 
            };

            // 自分が参加しているゲーム
            if (game.playerA === playerName || (game.playerB && game.playerB === playerName)) {
                // 終了済みでも、ログがまだ存在する場合は返す
                currentGames.push(publicGame);
            } 
            // 自分が参加できるゲーム (参加者Bが空かつ参加待ちステータス)
            else if (game.status === 'WAITING_JOIN' && !game.playerB) {
                availableGames.push(publicGame);
            }
        });
        
        // 3. スコア情報も提供 (認証に必要)
        const playerScores = allScores.map(p => ({
            name: p.name,
            pass: p.pass, // 認証のためpassも公開 (mypage.jsと同様の仕組み)
            score: p.score
        }));


        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                currentGames: currentGames, 
                availableGames: availableGames,
                allScores: playerScores // ログイン検証用
            })
        };
    } catch (error) {
        console.error("PVPデータフェッチエラー:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch PVP data', details: error.message })
        };
    }
};
