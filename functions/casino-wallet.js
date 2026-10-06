// カジノの財布 (55.0 から)。Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//
//   持ち込み・精算は 55.0 で無くした。賭けられるのは「使えるレート = レート − 結果待ちの賭け (押さえている額)」まで。
//   押さえている額は、3つの卓 (ブラックジャック・宝探し・沈没) に置いている賭けを、そのつど卓から数える
//   (財布の残高を別に持たないので、卓とずれない)。
//     ブラックジャック: 席に置いた賭け金 + 勝負の途中の手の賭け金 (ダブル・スプリットのぶんも)
//     宝探し: 結果が出る前の回に買った券の代金
//     沈没: 結果が出る前の便の運賃
//   レートは結果が出たときに差し引き (払い戻し − 賭け) だけ動かす。スロット・成り上がり・航海は1回ごとにその場で。
//   卓の進め方 (blackjack-table.js など) は今までどおり財布の chips を増減するので、
//   index.js は「chips の増減 + その卓で押さえている額の増減」をレートの増減にする (賭けたときは 0、決着で差し引き)。
//
//   増減ログは、同じゲームを続けているあいだ1件に書き足す (指名手配と同じ)。
//   最後の記録からレートがほかで動いた・CASINO_LOG_IDLE_MS 空いた・日付が変わったら次の1件にする。
//   reason は「スロット 120回 (賭け 1,200・収支 +340)」。参加ボーナスはこの「ゲーム名 N回」を数える。

import { blackjackPlayerTotals } from './blackjack.js';

export const CASINO_LOG_IDLE_MS = 30 * 60 * 1000;

// ゲームごとの増減ログの source・名前と、口座で遊んだ回数を持つ項目
export const CASINO_LOG_GAMES = {
  blackjack: { source: 'casino_blackjack', name: 'ブラックジャック', plays: 'bjHands' },
  slot: { source: 'casino_slot', name: 'スロット', plays: 'slotSpins' },
  gappori: { source: 'casino_gappori', name: '宝探し', plays: 'gpRounds' },
  nariagari: { source: 'casino_nariagari', name: '成り上がり', plays: 'nrSpins' },
  voyage: { source: 'casino_voyage', name: '航海', plays: 'vgRolls' },
  sink: { source: 'casino_sink', name: '沈没', plays: 'skRounds' }
};

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) + 0 : 0;
}

/** ブラックジャックの卓で uid が押さえている額 */
export function blackjackHeld(table, uid) {
  if (!table) return 0;
  const seat = (table.seats || []).find(item => item && item.uid === uid);
  let held = seat ? Math.max(0, toInt(seat.bet)) : 0;
  if (table.phase === 'playing' && table.round && table.round.phase !== 'done') {
    const player = (table.round.players || []).find(item => item.uid === uid);
    if (player) held += blackjackPlayerTotals(player).bet;
  }
  return held;
}

/** 宝探しの卓で uid が押さえている額 (結果が出る前の券の代金) */
export function gapporiHeld(table, uid) {
  if (!table || table.phase === 'result') return 0;
  return (table.tickets || []).filter(ticket => ticket.uid === uid).reduce((sum, ticket) => sum + toInt(ticket.cost), 0);
}

/** 沈没の船で uid が押さえている額 (結果が出る前の便の運賃) */
export function sinkHeld(table, uid) {
  if (!table || table.phase === 'result' || !table.fare) return 0;
  return (table.players || []).some(player => player.uid === uid) ? toInt(table.fare) : 0;
}

const HELD_BY_TABLE = { blackjack: blackjackHeld, gappori: gapporiHeld, sink: sinkHeld };

/** その卓で押さえている額。game がその3つ以外 (スロットなど) なら 0 */
export function tableHeld(game, table, uid) {
  return HELD_BY_TABLE[game] ? HELD_BY_TABLE[game](table, uid) : 0;
}

/** 3つの卓 (tables: { blackjack, gappori, sink }) で押さえている額の合計 */
export function casinoHeld(tables, uid) {
  return Object.keys(HELD_BY_TABLE).reduce((sum, game) => sum + tableHeld(game, tables[game], uid), 0);
}

function normalizeLog(value) {
  if (!value || typeof value !== 'object' || !value.historyId) return null;
  return {
    historyId: String(value.historyId),
    createdAt: String(value.createdAt || ''),
    lastAt: String(value.lastAt || ''),
    date: String(value.date || ''),
    beforeScore: toInt(value.beforeScore),
    afterScore: toInt(value.afterScore),
    plays: Math.max(0, toInt(value.plays)),
    wagered: Math.max(0, toInt(value.wagered))
  };
}

/**
 * 増減ログを1件にまとめる。いまの1件 (log) に書き足せるなら同じ historyId で、書き足せないなら新しい1件として、
 * 次の log を返す。書き足せるのは: 最後の記録からレートがほかで動いていない (afterScore が beforeScore と同じ)・
 * 最後から CASINO_LOG_IDLE_MS 以内・同じ日 (JST) のとき。
 *   step: { at, date, beforeScore, afterScore, plays, wagered }
 */
export function casinoLogStep(log, step, newHistoryId) {
  const current = normalizeLog(log);
  const continues = current
    && current.afterScore === step.beforeScore
    && current.date === step.date
    && Date.parse(step.at) - Date.parse(current.lastAt) < CASINO_LOG_IDLE_MS;
  const base = continues ? current : {
    historyId: newHistoryId(),
    createdAt: step.at,
    lastAt: step.at,
    date: step.date,
    beforeScore: step.beforeScore,
    afterScore: step.beforeScore,
    plays: 0,
    wagered: 0
  };
  return {
    ...base,
    lastAt: step.at,
    afterScore: step.afterScore,
    plays: base.plays + Math.max(0, toInt(step.plays)),
    wagered: base.wagered + Math.max(0, toInt(step.wagered))
  };
}

function signed(value) {
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toLocaleString('ja-JP')}`;
}

/** 増減ログの reason。「スロット 120回 (賭け 1,200・収支 +340)」 */
export function casinoLogReason(game, log) {
  const info = CASINO_LOG_GAMES[game];
  return `${info.name} ${log.plays}回 (賭け ${log.wagered.toLocaleString('ja-JP')}・収支 ${signed(log.afterScore - log.beforeScore)})`;
}

/** グラフで1つの点にまとめる目印。同じゲームで同時に始まった人 (同じ回の卓) は同じ点で動く */
export function casinoChartKey(game, log) {
  return `${CASINO_LOG_GAMES[game].source}|${log.createdAt}`;
}
