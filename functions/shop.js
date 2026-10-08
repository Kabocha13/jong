// 購入 (57.5〜。ゲーム一覧の「購入」)。いまのレートを、ゲームで使える道具に交換する。Firestore には触らない (index.js から呼ぶ)。
//
//   チュン (宝探し): どのお宝の球でもよい札 (口座の gpHaku。中の名前は 55.19 の「ハク」のまま)。1回ぶん
//   スタンプ (宝探し): スタンプカードに1つ (gpStamps。3つでチュン1回)
//   スロット天井到達: スロットの天井 (前のジャックポットタイムから通常モード600回) まで進める。
//     そのあとは1回ごとに10% でジャックポットタイムに入り、入ったときの固定の賭け金は買ったときに選んだ額 (slot_states の ceilingBet)
//   永久Pro会員: players の status を pro にし、proForever を付ける (管理画面で一般に戻されても Pro のまま)
//
// 値段は道具の値打ち (tools/gappori-return.mjs・functions/slot.js の還元率) から少し上に決めた:
//   チュン 1回の値打ち ≒ 1口あたり 158 (いちばん得な使い方の期待値 − 券の代金。もう3球でもう少し上がる)。
//     57.6 からチュンの券を何口でも買えるので、値打ちは口数に比例する → 1,000 (57.5 は1口だけで 200)
//   スタンプ 1つ ≒ チュン 1/3 回 → 350 (3つで 1,050。チュンを直接買うより少し高い。57.5 は 70)
//   スロット天井到達: ジャックポットタイム1回 (平均11回 × 還元率 1005.74%) の得 ≒ 賭け金 × 99.6、
//     入るまでの通常モード (平均10回・還元率 94.89%) の損を引いて ≒ 賭け金 × 99 → 賭け金 × 110
//   永久Pro会員: 100,000 (決まった値段)

export class ShopError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const SHOP_SLOT_BETS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];   // 天井到達で選べる賭け金 (スロットの賭け金と同じ)
export const SHOP_MAX_COUNT = 99;   // チュン・スタンプを1回に買える数

export const SHOP_ITEMS = {
  chun: { name: 'チュン (宝探し)', price: 1000, countable: true },
  stamp: { name: 'スタンプ (宝探し)', price: 350, countable: true },
  slotCeiling: { name: 'スロット天井到達', pricePerBet: 110 },
  proForever: { name: '永久Pro会員', price: 100000 }
};

/** 画面に出す品書き (値段) */
export function publicShopItems() {
  return Object.fromEntries(Object.entries(SHOP_ITEMS).map(([id, item]) => [id, { ...item }]));
}

/**
 * 買う物と数から値段を決める。body は { item, count, bet }。
 * 戻り値: { item, count, bet, price, reason (増減ログの理由) }
 */
export function quoteShopItem(body) {
  const id = String(body?.item || '');
  const item = SHOP_ITEMS[id];
  if (!item) throw new ShopError(400, 'その品物はありません。');
  if (item.countable) {
    const count = Number(body?.count ?? 1);
    if (!Number.isSafeInteger(count) || count < 1 || count > SHOP_MAX_COUNT) {
      throw new ShopError(400, `数は1〜${SHOP_MAX_COUNT}にしてください。`);
    }
    return { item: id, count, bet: null, price: item.price * count, reason: `購入: ${item.name} ×${count}` };
  }
  if (id === 'slotCeiling') {
    const bet = Number(body?.bet);
    if (!SHOP_SLOT_BETS.includes(bet)) throw new ShopError(400, `賭け金は ${SHOP_SLOT_BETS.join('・')} のどれかにしてください。`);
    return { item: id, count: 1, bet, price: item.pricePerBet * bet, reason: `購入: ${item.name} (賭け金 ${bet.toLocaleString('ja-JP')})` };
  }
  return { item: id, count: 1, bet: null, price: item.price, reason: `購入: ${item.name}` };
}
