// 購入 (57.5〜。ゲーム一覧の「購入」、#shop)。いまのレートを、ゲームで使える道具に交換する。
//   品書きと値段はサーバー (functions/shop.js) が決め、shopStatus で受け取る。買うのは shopBuy (代金はその場でレートから引く)。
//   チュン・スタンプは宝探し、天井到達はスロット、永久Pro会員はプレイヤーの会員の種類に効く。

const SHOP_ICONS = {
    chun: () => gapporiSymbol(GAPPORI_HAKU),
    stamp: () => gapporiStampImage(),
    slotCeiling: () => createSymbol('chest'),
    proForever: () => {
        const mark = document.createElement('span');
        mark.className = 'shop-pro-mark';
        mark.textContent = '⭐';
        return mark;
    }
};

const SHOP_DESCRIPTIONS = {
    chun: '宝探しで、どのお宝の球でもよい札を1回使える (5個の予想で)',
    stamp: '宝探しのスタンプカードに1つ押す。5つでチュンを1回使える',
    slotCeiling: 'スロットの天井まで進める。そこからは1回ごとに10%でジャックポットタイムに入り、入ったときの賭け金は選んだ額で固定',
    proForever: 'ずっとPro会員になる (1日のプレイは1,000回まで。ラグジュアリー会員は、ラグジュアリーが終わってもProのまま)'
};

const shop = {
    state: null,        // サーバーの品書きといまの持ち物 (functions/index.js の publicShopState)
    counts: { chun: 1, stamp: 1 },
    bet: 10,            // 天井到達の賭け金
    busy: false,
    loading: false
};

function isShopRoute() {
    return location.hash.slice(1) === 'shop';
}

async function openShop() {
    loadSlotSymbolImage(GAPPORI_HAKU);
    renderShop();
    if (shop.loading) return;
    shop.loading = true;
    try {
        const data = await callCasino('shopStatus');
        shop.state = data.shop;
        renderShop();
    } catch (error) {
        showMessage(el('shop-message'), error.message, 'error');
    } finally {
        shop.loading = false;
    }
}

function shopPrice(id) {
    const item = shop.state?.items?.[id];
    if (!item) return null;
    if (id === 'slotCeiling') return item.pricePerBet * shop.bet;
    if (item.countable) return item.price * shop.counts[id];
    return item.price;
}

/** 持ち物・買えるかどうか。{ owned (いまの持ち物の文), blocked (買えない理由。買えるなら '') } */
function shopItemStatus(id) {
    const state = shop.state;
    if (!state) return { owned: '', blocked: '読み込み中…' };
    if (id === 'chun') return { owned: `いま チュン 残り${state.chun}回`, blocked: '' };
    if (id === 'stamp') return { owned: `いま スタンプカード ${state.stamps}/${GAPPORI_STAMPS_PER_CARD}`, blocked: '' };
    if (id === 'slotCeiling') {
        if (state.slotCeiling.jackpot) return { owned: 'いまジャックポットタイム中', blocked: 'ジャックポットタイムの途中は買えません' };
        if (state.slotCeiling.bought) {
            return { owned: `天井到達中 (賭け金 ${state.slotCeiling.bet.toLocaleString('ja-JP')})`, blocked: 'ジャックポットタイムに入ったら、また買えます' };
        }
        return { owned: '', blocked: '' };
    }
    if (state.proForever) return { owned: '永久Pro会員です', blocked: 'もう永久Pro会員です' };
    return { owned: state.status === 'luxury' ? 'いまラグジュアリー会員' : state.status === 'pro' ? 'いまPro会員' : 'いま一般会員', blocked: '' };
}

function renderShop() {
    const list = el('shop-items');
    if (!list) return;
    el('shop-score').textContent = formatRate(casino.score);
    const held = casino.session?.held || 0;
    el('shop-held').textContent = held > 0 ? `(結果待ち ${formatRate(held)}。使えるのは ${formatRate((casino.session?.chips) ?? casino.score)})` : '';
    list.innerHTML = '';
    const ids = shop.state ? Object.keys(shop.state.items) : ['chun', 'stamp', 'slotCeiling', 'proForever'];
    ids.forEach(id => list.appendChild(shopItemCard(id)));
}

function shopItemCard(id) {
    const item = shop.state?.items?.[id];
    const card = document.createElement('article');
    card.className = `shop-item is-${id}`;
    const icon = document.createElement('span');
    icon.className = 'shop-item-icon';
    icon.appendChild(SHOP_ICONS[id]());
    const body = document.createElement('div');
    body.className = 'shop-item-body';
    const name = document.createElement('h3');
    name.className = 'shop-item-name';
    name.textContent = item?.name || { chun: 'チュン (宝探し)', stamp: 'スタンプ (宝探し)', slotCeiling: 'スロット天井到達', proForever: '永久Pro会員' }[id];
    const desc = document.createElement('p');
    desc.className = 'shop-item-desc';
    desc.textContent = SHOP_DESCRIPTIONS[id];
    const { owned, blocked } = shopItemStatus(id);
    const own = document.createElement('p');
    own.className = 'shop-item-owned';
    own.textContent = owned;
    body.append(name, desc, own);

    const controls = document.createElement('div');
    controls.className = 'shop-item-controls';
    if (item?.countable) {
        const step = (delta) => {
            shop.counts[id] = Math.max(1, Math.min(shop.state.maxCount, shop.counts[id] + delta));
            renderShop();
        };
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'shop-step';
        down.textContent = '−';
        down.setAttribute('aria-label', '数を減らす');
        down.disabled = shop.counts[id] <= 1;
        down.addEventListener('click', () => step(-1));
        const count = document.createElement('span');
        count.className = 'shop-count';
        count.textContent = `×${shop.counts[id]}`;
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'shop-step';
        up.textContent = '＋';
        up.setAttribute('aria-label', '数を増やす');
        up.disabled = shop.counts[id] >= shop.state.maxCount;
        up.addEventListener('click', () => step(1));
        controls.append(down, count, up);
    } else if (id === 'slotCeiling' && shop.state) {
        const label = document.createElement('label');
        label.className = 'shop-bet';
        label.append('賭け金 ');
        const select = document.createElement('select');
        shop.state.slotBets.forEach(bet => {
            const option = document.createElement('option');
            option.value = String(bet);
            option.textContent = bet.toLocaleString('ja-JP');
            option.selected = bet === shop.bet;
            select.appendChild(option);
        });
        select.addEventListener('change', () => {
            shop.bet = Number(select.value);
            renderShop();
        });
        label.appendChild(select);
        controls.appendChild(label);
    }
    const price = shopPrice(id);
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'action-button btn-gold shop-buy';
    buy.textContent = price === null ? '…' : `${price.toLocaleString('ja-JP')} で買う`;
    const chips = casino.session?.chips ?? casino.score;
    buy.disabled = shop.busy || price === null || Boolean(blocked) || price > chips;
    buy.title = blocked || (price !== null && price > chips ? '使えるレートが足りません' : '');
    buy.addEventListener('click', () => buyShopItem(id));
    controls.appendChild(buy);
    if (blocked && shop.state) {
        const note = document.createElement('p');
        note.className = 'shop-item-blocked';
        note.textContent = blocked;
        controls.appendChild(note);
    }
    card.append(icon, body, controls);
    return card;
}

async function buyShopItem(id) {
    const price = shopPrice(id);
    const item = shop.state?.items?.[id];
    if (shop.busy || !item || price === null) return;
    const what = item.countable ? `${item.name} ×${shop.counts[id]}` : id === 'slotCeiling' ? `${item.name} (賭け金 ${shop.bet.toLocaleString('ja-JP')})` : item.name;
    if (!window.confirm(`${what} を ${price.toLocaleString('ja-JP')} で買いますか？\nレートから ${price.toLocaleString('ja-JP')} 引かれます。`)) return;
    shop.busy = true;
    renderShop();
    try {
        const data = await callCasino('shopBuy', { item: id, count: shop.counts[id] || 1, bet: shop.bet });
        casino.score = data.score;
        if (data.session) casino.session = data.session;
        shop.state = data.shop;
        if (data.slot) receiveSlotState(data.slot);
        renderGapporiStamps();
        const note = data.bought?.note ? ` (${data.bought.note})` : '';
        showMessage(el('shop-message'), `✅ ${what} を買いました${note}。レート ${formatRate(data.score)}`, 'success');
    } catch (error) {
        showMessage(el('shop-message'), error.message, 'error');
    } finally {
        shop.busy = false;
        renderShop();
    }
}
