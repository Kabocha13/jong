// assets/js/career.js

// ============================================================
// 定数
// ============================================================
const POST_TYPES = {
    pass_doc:              { label: '📄 書類通過',      points: 20 },
    pass_interview_1:      { label: '💬 1次面接通過',   points: 30 },
    pass_interview_2:      { label: '💬 2次面接通過',   points: 30 },
    pass_interview_3:      { label: '💬 3次面接通過',   points: 30 },
    pass_interview_final:  { label: '💬 最終面接通過',  points: 30 },
    offer:                 { label: '🎉 内定',          points: 100 },
};
const OFFER_BONUS     = 100;  // 内定時に全員へ配布するボーナスP

// ============================================================
// 状態
// ============================================================
let authenticatedUser = null;

// ============================================================
// DOM要素
// ============================================================
const AUTH_SECTION    = document.getElementById('auth-section');
const CAREER_CONTENT  = document.getElementById('career-content');
const AUTH_FORM       = document.getElementById('auth-form');
const AUTH_MESSAGE    = document.getElementById('auth-message');
const LOGOUT_BUTTON   = document.getElementById('logout-button');

// ============================================================
// 認証
// ============================================================
async function attemptLogin(username, password, isAuto = false) {
    if (!isAuto) showMessage(AUTH_MESSAGE, '認証中...', 'info');

    try {
        const allData = await fetchAllData();
        const user = allData.scores.find(p => p.name === username && p.pass === password);
        if (!user) {
            if (!isAuto) showMessage(AUTH_MESSAGE, '❌ ユーザー名またはパスワードが違います。', 'error');
            return false;
        }
        authenticatedUser = { ...user };
        localStorage.setItem('authUsername', username);
        localStorage.setItem('authPassword', password);

        AUTH_SECTION.classList.add('hidden');
        CAREER_CONTENT.classList.remove('hidden');
        document.getElementById('authenticated-user-name').textContent = authenticatedUser.name;
        document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);

        await renderAll();
        return true;
    } catch (err) {
        if (!isAuto) showMessage(AUTH_MESSAGE, `❌ エラー: ${err.message}`, 'error');
        return false;
    }
}

function handleLogout() {
    authenticatedUser = null;
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authPassword');
    CAREER_CONTENT.classList.add('hidden');
    AUTH_SECTION.classList.remove('hidden');
    AUTH_FORM.reset();
    showMessage(AUTH_MESSAGE, '👋 ログアウトしました。', 'info');
}

AUTH_FORM.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    await attemptLogin(username, password, false);
});

LOGOUT_BUTTON.addEventListener('click', handleLogout);

// ============================================================
// 投稿フォーム
// ============================================================
document.getElementById('career-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl  = document.getElementById('post-message');
    const type       = document.getElementById('post-type').value;
    const company    = document.getElementById('post-company').value.trim();
    const submitBtn  = e.target.querySelector('button[type="submit"]');

    if (!type || !company) {
        showMessage(messageEl, '❌ 種別と企業名を入力してください。', 'error');
        return;
    }

    submitBtn.disabled = true;
    try {
        const currentData = await fetchAllData();
        const postDef     = POST_TYPES[type];

        const newPost = {
            id:         `cp_${Date.now()}`,
            player:     authenticatedUser.name,
            type,
            company,
            postedAt:   new Date().toISOString(),
            points:     postDef.points,
        };

        // スコアをMapで管理
        const scoreMap = new Map(currentData.scores.map(s => [s.name, { ...s }]));

        // 投稿者にポイント付与
        if (postDef.points > 0) {
            const poster = scoreMap.get(authenticatedUser.name);
            if (poster) poster.score = parseFloat((poster.score + postDef.points).toFixed(1));
        }

        // 内定の場合、全員（投稿者含む）にボーナスP付与
        if (type === 'offer') {
            for (const [, player] of scoreMap) {
                player.score = parseFloat((player.score + OFFER_BONUS).toFixed(1));
            }
        }

        const newCareerPosts = [...(currentData.career_posts || []), newPost];

        const newData = {
            scores:               Array.from(scoreMap.values()),
            sports_bets:          currentData.sports_bets          || [],
            speedstorm_records:   currentData.speedstorm_records    || [],
            lotteries:            currentData.lotteries             || [],
            gift_codes:           currentData.gift_codes            || [],
            exercise_reports:     currentData.exercise_reports      || [],
            career_posts:         newCareerPosts,
        };

        const res = await updateAllData(newData);
        if (res.status === 'success') {
            let msg = `✅ 投稿しました。`;
            if (postDef.points > 0) msg += ` +${postDef.points}P 獲得！`;
            if (type === 'offer')    msg += ` 全員に ${OFFER_BONUS}P のボーナスが配布されました🎉`;
            showMessage(messageEl, msg, 'success');

            // 残高を更新
            const updated = Array.from(scoreMap.values()).find(s => s.name === authenticatedUser.name);
            if (updated) {
                authenticatedUser.score = updated.score;
                document.getElementById('current-score').textContent = authenticatedUser.score.toFixed(1);
            }

            e.target.reset();
            await renderAll();
        } else {
            showMessage(messageEl, `❌ 投稿エラー: ${res.message}`, 'error');
        }
    } catch (err) {
        showMessage(messageEl, `❌ サーバーエラー: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

// ============================================================
// レンダリング
// ============================================================
async function renderAll() {
    const currentData = await fetchAllData();
    renderTimeline(currentData.career_posts || []);
    renderRanking(currentData.career_posts || [], currentData.scores || []);
}

function renderTimeline(posts) {
    const container = document.getElementById('career-timeline-container');
    if (posts.length === 0) {
        container.innerHTML = '<p>まだ投稿がありません。</p>';
        return;
    }

    const sorted = [...posts].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
    container.innerHTML = sorted.map(post => {
        const def  = POST_TYPES[post.type] || { label: post.type };
        const date = new Date(post.postedAt).toLocaleDateString('ja-JP');
        return `
        <div style="border-left:4px solid ${typeColor(post.type)};padding:10px 14px;margin-bottom:12px;background:#fafafa;border-radius:0 6px 6px 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                <span><strong>${escapeHtml(post.player)}</strong>　<span style="color:${typeColor(post.type)};font-weight:bold;">${def.label}</span></span>
                <span style="color:#888;font-size:0.85em;">${date}</span>
            </div>
            <p style="margin:4px 0 0;font-size:1em;">🏢 ${escapeHtml(post.company)}</p>
        </div>`;
    }).join('');
}

function renderRanking(posts, scores) {
    const container = document.getElementById('career-ranking-container');

    // プレイヤーごとに集計
    const stats = {};
    for (const post of posts) {
        if (!stats[post.player]) {
            stats[post.player] = { offers: 0, finalPassed: 0, interviews: 0, docPassed: 0 };
        }
        if (post.type === 'offer')                stats[post.player].offers++;
        else if (post.type === 'pass_interview_final') stats[post.player].finalPassed++;
        else if (post.type.startsWith('pass_interview_')) stats[post.player].interviews++;
        else if (post.type === 'pass_doc')         stats[post.player].docPassed++;
    }

    const players = Object.entries(stats).sort((a, b) => {
        const s = (p) => p[1].offers * 1000 + p[1].finalPassed * 100 + p[1].interviews * 10 + p[1].docPassed;
        return s(b) - s(a);
    });

    if (players.length === 0) {
        container.innerHTML = '<p>まだデータがありません。</p>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
            <thead>
                <tr style="border-bottom:2px solid #ddd;text-align:left;">
                    <th style="padding:6px 4px;">順位</th>
                    <th style="padding:6px 4px;">名前</th>
                    <th style="padding:6px 4px;text-align:center;">内定</th>
                    <th style="padding:6px 4px;text-align:center;">最終通過</th>
                    <th style="padding:6px 4px;text-align:center;">面接通過</th>
                    <th style="padding:6px 4px;text-align:center;">書類通過</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(([name, s], i) => `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:6px 4px;">${medals[i] || i + 1}</td>
                    <td style="padding:6px 4px;font-weight:bold;">${escapeHtml(name)}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.offers > 0 ? `<span style="color:#e74c3c;font-weight:bold;">${s.offers}</span>` : '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.finalPassed || '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.interviews || '—'}</td>
                    <td style="padding:6px 4px;text-align:center;">${s.docPassed || '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

function typeColor(type) {
    if (type === 'offer')                    return '#e74c3c';
    if (type === 'pass_interview_final')     return '#e67e22';
    if (type.startsWith('pass_interview_')) return '#3498db';
    if (type === 'pass_doc')                return '#27ae60';
    return '#95a5a6';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
// 初期化
// ============================================================
window.onload = async () => {
    const savedUser = localStorage.getItem('authUsername');
    const savedPass = localStorage.getItem('authPassword');
    if (savedUser && savedPass) {
        await attemptLogin(savedUser, savedPass, true);
    }
};
