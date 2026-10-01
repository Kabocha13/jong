// 参加ボーナス。指定した日 (JST) に麻雀やカジノに参加した回数に応じてレートを配る。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//
//   - 麻雀: 参加した対局の数 (1局 = 1回)。増減ログの reason「三人麻雀 A 43600 / B 31000 / C 30400」から参加者を読むので、
//     レートが動かなかった人 (増減ログが残らない人) も数えられる
//   - カジノ: 遊んだ回数 (ブラックジャックは1ハンド、スロットは10回転、宝探しは券を買った1回の抽選 = 1回)。
//     スロットはその日の回転数を人ごとに足してから10で割る (端数は切り捨て。15回転と5回転の精算なら 20回転 = 2回)。
//     ルーレットとテキサスホールデムは 52.0 で廃止したが、それまでの記録 (casino_roulette は1スピン、
//     casino_holdem は1ハンド = 1回) も数える。
//     精算の reason「ブラックジャック 3回 (持込500 → 600)」「カジノ ブラックジャック2回・スロット5回 (…)」の「N回」を足す。
//     精算で増減が 0 だったとき は増減ログが残らないので数えられない
//   - ボーナス = 麻雀の回数 × 1局あたり + カジノの回数 × 1回あたり

export const PARTICIPATION_BONUS_SOURCE = 'participation_bonus';
export const PARTICIPATION_BONUS_MAX_UNIT = 1000;   // 1回あたりの額の上限 (打ち間違いで大量に配らないように)
const MAHJONG_SOURCE = 'mahjong';
const CASINO_SOURCES = new Set(['casino', 'casino_roulette', 'casino_blackjack', 'casino_slot', 'casino_gappori', 'casino_holdem']);
export const SLOT_SPINS_PER_PLAY = 10;   // スロットはこの回転数で1回と数える

export class ParticipationBonusError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 'YYYY-MM-DD' (JST) の検証。その日の 0:00〜翌日 0:00 (JST) を ISO 文字列で返す */
export function jstDayRange(dateKey) {
  const key = String(dateKey || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00+09:00`))) {
    throw new ParticipationBonusError(400, '日付は YYYY-MM-DD で指定してください。');
  }
  const start = Date.parse(`${key}T00:00:00+09:00`);
  return { start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString() };
}

/** 1回あたりの額。0〜PARTICIPATION_BONUS_MAX_UNIT の整数 */
export function normalizeBonusUnits(body) {
  const read = (value, label) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > PARTICIPATION_BONUS_MAX_UNIT) {
      throw new ParticipationBonusError(400, `${label}は0〜${PARTICIPATION_BONUS_MAX_UNIT}の整数で入力してください。`);
    }
    return number;
  };
  const units = {
    perMahjong: read(body?.perMahjong, '麻雀1局あたりの額'),
    perCasino: read(body?.perCasino, 'カジノ1回あたりの額')
  };
  if (units.perMahjong === 0 && units.perCasino === 0) {
    throw new ParticipationBonusError(400, '1回あたりの額をどちらか1以上にしてください。');
  }
  return units;
}

/** 麻雀の reason から参加者の名前を取り出す。「三人麻雀 A 43600 / B 31000」→ ['A', 'B'] */
export function mahjongPlayersFromReason(reason) {
  const text = String(reason || '');
  const firstSpace = text.indexOf(' ');
  if (firstSpace < 0) return [];
  return text.slice(firstSpace + 1).split(' / ').map(part => {
    const trimmed = part.trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    return lastSpace > 0 ? trimmed.slice(0, lastSpace) : '';
  }).filter(Boolean);
}

/**
 * カジノの精算の reason から遊んだ回数を取り出す。括弧 (持込…) より前の「ゲーム名 N回」を読む。
 * 「スロット 25回」「カジノ ブラックジャック2回・スロット25回」→ スロットは回転数 (slotSpins)、ほかは回数 (plays) に足す
 */
export function casinoPlaysFromReason(reason) {
  const label = String(reason || '').split(' (')[0];
  let plays = 0;
  let slotSpins = 0;
  for (const match of label.matchAll(/([^\s・\d]*)\s?(\d+)回/g)) {
    if (match[1] === 'スロット') slotSpins += Number(match[2]);
    else plays += Number(match[2]);
  }
  return { plays, slotSpins };
}

/**
 * その日の増減ログから、人ごとの参加回数を数える。
 * entries: [{ player, source, reason, createdAt }]、excluded: 数えない名前 (CPU など)
 * 返り値: Map 名前 → { mahjong, casino }
 */
export function tallyParticipation(entries, excluded = new Set()) {
  const counts = new Map();
  const slotSpins = new Map();   // 名前 → その日のスロットの回転数 (最後に10回転 = 1回にする)
  const add = (name, key, amount) => {
    if (!name || excluded.has(name) || amount <= 0) return;
    const current = counts.get(name) || { mahjong: 0, casino: 0 };
    current[key] += amount;
    counts.set(name, current);
  };

  // 麻雀は1局で参加者それぞれに増減ログが残るので、同じ時刻・同じ内容を1局にまとめる
  const games = new Map();
  (entries || []).forEach(entry => {
    if (!entry) return;
    const source = String(entry.source || '');
    if (source === MAHJONG_SOURCE) {
      const key = `${entry.createdAt}\n${entry.reason}`;
      const players = games.get(key) || new Set(mahjongPlayersFromReason(entry.reason));
      if (entry.player) players.add(String(entry.player));
      games.set(key, players);
    } else if (CASINO_SOURCES.has(source)) {
      const name = String(entry.player || '');
      const played = casinoPlaysFromReason(entry.reason);
      add(name, 'casino', played.plays);
      if (played.slotSpins > 0) slotSpins.set(name, (slotSpins.get(name) || 0) + played.slotSpins);
    }
  });
  games.forEach(players => players.forEach(name => add(name, 'mahjong', 1)));
  slotSpins.forEach((spins, name) => add(name, 'casino', Math.floor(spins / SLOT_SPINS_PER_PLAY)));
  return counts;
}

/** 参加回数と1回あたりの額から、人ごとの配布額を並べる (多い順)。knownPlayers に無い名前は除く */
export function buildParticipationGrants(counts, units, knownPlayers) {
  const grants = [];
  counts.forEach((count, player) => {
    if (knownPlayers && !knownPlayers.has(player)) return;
    const bonus = count.mahjong * units.perMahjong + count.casino * units.perCasino;
    if (bonus > 0) grants.push({ player, mahjong: count.mahjong, casino: count.casino, bonus });
  });
  return grants.sort((a, b) => b.bonus - a.bonus || a.player.localeCompare(b.player));
}

/** 増減ログの reason。「参加ボーナス 9/29 麻雀3局・カジノ65回」 */
export function participationBonusReason(dateKey, grant) {
  const [, month, day] = String(dateKey).split('-').map(Number);
  const parts = [];
  if (grant.mahjong > 0) parts.push(`麻雀${grant.mahjong}局`);
  if (grant.casino > 0) parts.push(`カジノ${grant.casino}回`);
  return `参加ボーナス ${month}/${day} ${parts.join('・')}`;
}
