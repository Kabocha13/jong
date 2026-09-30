// レートの貸し出し (借金) のルール。
//   Firestore や HTTP には触らず、数の計算だけをここに置く (index.js から呼ぶ)。
//
//   - 誰でも借りられる。上限 (信用枠) は「日付をまたいでから返した元本」「付いた利息」「レートの変動の大きさ」で決まる。
//     実績が無い人の枠は 基本枠 × 安定度 (既定 2000 × 25〜100% = 500〜2000)
//   - 当日中に返した分は信用の実績に数えない (利息なしで借りて返すのを繰り返して枠を増やせないように)。
//     日付をまたいで利息が付いたときに残っていた元本だけが「またいだ元本」になり、それを返すと実績になる
//   - 借りたレートは通常のレートと同じ扱い (カジノや送金に使え、日次レート補正の対象)
//   - 利息は 1日で5割。毎日 0:05 の日次補正のときに、残っている借金を 1.5倍 にする (複利)。
//     当日中に返せば利息は付かない。自動で徴収はせず、自分で返すまで残る
//   - 数値 (利率・基本枠・上限など) は settings/app で変えられる (管理画面)。無ければ既定値

// settings/app のキー名 → 既定値。管理画面はこのキーで保存する
export const LOAN_SETTING_DEFAULTS = {
  loan_interest_rate: 0.5,       // 1日の利率 (0.5 = 5割)
  loan_base_limit: 2000,         // 実績が無くても借りられる額 (変動が無いとき)
  loan_min_limit: 100,           // どれだけ信用を落としても、この額だけは借りられる (誰でも利用できる)
  loan_max_limit: 3000,          // 実績を積んでもこの額まで
  loan_trust_divisor: 2,         // 信用ポイント ÷ この値 が基本枠に足される
  loan_interest_weight: 0.5,     // 付いた利息 × この値 を信用ポイントから引く (返すのが遅いほど枠が減る)
  loan_volatility_scale: 500,    // 1日の変動の標準偏差がこの値のとき枠は 2/3、2倍のとき半分になる
  loan_stability_min: 0.25,      // 変動がどれだけ大きくても枠はこの割合までしか減らない (基本枠 2000 なら 500)
  loan_volatility_days: 14       // 変動の大きさを見る日数
};
export const LOAN_RECENT_LIMIT = 12;           // 本人に見せる直近の履歴の件数
export const LOAN_SOURCES = new Set(['loan_borrow', 'loan_repay', 'loan_interest']);
// 変動の大きさを見るときに除く増減。日次補正・参加ボーナス・船底の仕分けは決まった動きで「変動」ではなく、
// 借金の出入りも実力ではない
export const LOAN_VOLATILITY_EXCLUDED_SOURCES = new Set(['daily_rate_reversion', 'participation_bonus', 'underground_work', ...LOAN_SOURCES]);

export class LoanError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** レートは整数。-0 は 0 に揃える */
function toRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) + 0 : 0;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * settings/app から貸し出しの設定を取り出す。欠けていれば既定値、外れた値は範囲に収める。
 * 画面側 (assets/js/common.js の normalizeLoanSettings) と同じ丸め方にしておくこと
 */
export function loanSettingsFrom(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const d = LOAN_SETTING_DEFAULTS;
  const interestRate = clamp(toNumber(source.loan_interest_rate, d.loan_interest_rate), 0, 10);
  const minLimit = Math.max(0, toRate(toNumber(source.loan_min_limit, d.loan_min_limit)));
  const maxLimit = Math.max(minLimit, toRate(toNumber(source.loan_max_limit, d.loan_max_limit)));
  return {
    interestRate,
    baseLimit: Math.max(0, toRate(toNumber(source.loan_base_limit, d.loan_base_limit))),
    minLimit,
    maxLimit,
    trustDivisor: Math.max(0.01, toNumber(source.loan_trust_divisor, d.loan_trust_divisor)),
    interestWeight: Math.max(0, toNumber(source.loan_interest_weight, d.loan_interest_weight)),
    volatilityScale: Math.max(1, toNumber(source.loan_volatility_scale, d.loan_volatility_scale)),
    stabilityMin: clamp(toNumber(source.loan_stability_min, d.loan_stability_min), 0, 1),
    volatilityDays: clamp(Math.round(toNumber(source.loan_volatility_days, d.loan_volatility_days)), 1, 60)
  };
}

/** 保存されている貸し出し記録を、欠けている項目を埋めた形にする */
export function normalizeLoanRecord(record, player) {
  const source = record && typeof record === 'object' ? record : {};
  const debt = Math.max(0, toRate(source.debt));
  const principal = debt > 0 ? Math.min(debt, Math.max(0, toRate(source.principal))) : 0;
  return {
    player: String(source.player || player || ''),
    debt,
    principal,
    // いまの元本のうち、日付をまたいだ (利息が付いたときに残っていた) 分。当日に借り足した分は含まない
    carriedPrincipal: Math.min(principal, Math.max(0, toRate(source.carriedPrincipal))),
    borrowedAt: debt > 0 && source.borrowedAt ? String(source.borrowedAt) : null,
    repaidTotal: Math.max(0, toRate(source.repaidTotal)),         // 返した額の合計 (利息込み・表示用)
    repaidPrincipal: Math.max(0, toRate(source.repaidPrincipal)), // 返した元本の合計 (当日中に返した分も含む・表示用)
    repaidCarriedPrincipal: Math.max(0, toRate(source.repaidCarriedPrincipal)), // 日付をまたいでから返した元本 (信用の実績)
    interestTotal: Math.max(0, toRate(source.interestTotal)),     // これまでに付いた利息 (信用を下げる)
    loanCount: Math.max(0, toRate(source.loanCount)),
    repayCount: Math.max(0, toRate(source.repayCount)),
    interestCount: Math.max(0, toRate(source.interestCount)),     // 利息が付いた回数 (= 借金を持ち越した日数)
    recent: Array.isArray(source.recent) ? source.recent.slice(0, LOAN_RECENT_LIMIT) : [],
    updatedAt: source.updatedAt ? String(source.updatedAt) : null
  };
}

/**
 * 増減ログから「1日ごとの変動 (増減の合計)」を、古い順に返す。
 * 何も無かった日は 0 (動かないのも「予想できる」うちなので、変動なしとして数える)。
 * entries: [{ date: 'YYYY-MM-DD', delta, source }]、dateKeys: 古い順の日付キー
 */
export function dailyDeltasFromEntries(entries, dateKeys) {
  const byDate = new Map(dateKeys.map(date => [date, 0]));
  (entries || []).forEach(entry => {
    if (!entry || !byDate.has(entry.date)) return;
    if (LOAN_VOLATILITY_EXCLUDED_SOURCES.has(String(entry.source || ''))) return;
    byDate.set(entry.date, byDate.get(entry.date) + toRate(entry.delta));
  });
  return dateKeys.map(date => byDate.get(date));
}

/** 1日ごとの変動の標準偏差 (母標準偏差)。値が無ければ 0 */
export function volatilityOf(dailyDeltas) {
  const values = (dailyDeltas || []).map(value => Number(value) || 0);
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** 変動の大きさ → 枠に掛ける安定度 (stabilityMin〜1)。変動 0 なら 1、volatilityScale なら 0.5 */
export function stabilityOf(volatility, config) {
  const settings = config || loanSettingsFrom(null);
  const factor = 1 / (1 + Math.max(0, Number(volatility) || 0) / settings.volatilityScale);
  return clamp(factor, settings.stabilityMin, 1);
}

/**
 * 信用枠の計算。返り値には画面で内訳を見せるための途中の値も含める。
 *   信用ポイント = 日付をまたいでから返した元本 − 付いた利息 × interestWeight
 *   実績枠     = 基本枠 + 信用ポイント ÷ trustDivisor
 *   信用枠     = 実績枠 × 安定度   (minLimit〜maxLimit に収める)
 *   借入可能   = 信用枠 − いまの借金
 */
export function computeLoanLimit(loan, volatility, config) {
  const settings = config || loanSettingsFrom(null);
  const record = normalizeLoanRecord(loan);
  const trust = record.repaidCarriedPrincipal - record.interestTotal * settings.interestWeight;
  const historyLimit = settings.baseLimit + Math.round(trust / settings.trustDivisor);
  const stability = stabilityOf(volatility, settings);
  const limit = clamp(Math.round(historyLimit * stability), settings.minLimit, settings.maxLimit);
  return {
    limit,
    available: Math.max(0, limit - record.debt),
    breakdown: {
      base: settings.baseLimit,
      repaidCarriedPrincipal: record.repaidCarriedPrincipal,
      interestTotal: record.interestTotal,
      interestWeight: settings.interestWeight,
      trust: Math.round(trust),
      trustDivisor: settings.trustDivisor,
      historyLimit,
      volatility: Math.round(Number(volatility) || 0),
      volatilityDays: settings.volatilityDays,
      volatilityScale: settings.volatilityScale,
      stability: Math.round(stability * 100) / 100,
      stabilityMin: settings.stabilityMin,
      min: settings.minLimit,
      max: settings.maxLimit
    }
  };
}

/** 借りる額の検証。整数で 1 以上、借入可能な額まで */
export function validateBorrowAmount(rawAmount, available) {
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new LoanError(400, '借りる額は1以上の整数で入力してください。');
  }
  if (amount > available) {
    throw new LoanError(400, available > 0
      ? `いま借りられるのは ${available} までです。`
      : '信用枠を使い切っています。返済すると再び借りられます。');
  }
  return amount;
}

/** 返す額の検証。整数で 1 以上、借金と手持ちのレートのどちらも超えない */
export function validateRepayAmount(rawAmount, debt, score) {
  const amount = Number(rawAmount);
  if (debt <= 0) {
    throw new LoanError(409, '返す借金がありません。');
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new LoanError(400, '返す額は1以上の整数で入力してください。');
  }
  if (amount > debt) {
    throw new LoanError(400, `借金は ${debt} なので、それ以上は返せません。`);
  }
  if (amount > Math.max(0, score)) {
    throw new LoanError(400, `手持ちのレート (${score}) を超えて返すことはできません。`);
  }
  return amount;
}

/** 借りたあとの記録。借りた額がそのまま借金に乗る (利息は日付をまたいだときに付く)。借り足した分は「またいだ元本」に入らない */
export function applyBorrow(loan, amount, at) {
  const record = normalizeLoanRecord(loan);
  const debtBefore = record.debt;
  const debtAfter = record.debt + amount;
  const next = {
    ...record,
    debt: debtAfter,
    principal: record.principal + amount,
    borrowedAt: record.debt > 0 && record.borrowedAt ? record.borrowedAt : at,
    loanCount: record.loanCount + 1,
    recent: [{ type: 'borrow', amount, debtAfter, at }, ...record.recent].slice(0, LOAN_RECENT_LIMIT),
    updatedAt: at
  };
  return { loan: next, debtBefore, debtAfter };
}

/**
 * 自分で返したあとの記録。
 * 元本と利息の割合を保ったまま減らし、全額返せば元本も 0。
 * 減った元本のうち「またいだ元本」から先に返したことにし、その分だけを信用の実績 (repaidCarriedPrincipal) に足す。
 * 当日中に借りて返した分は実績にならない
 */
export function applyRepay(loan, amount, at) {
  const record = normalizeLoanRecord(loan);
  const debtBefore = record.debt;
  const debtAfter = Math.max(0, record.debt - amount);
  const principalAfter = debtAfter > 0 && debtBefore > 0
    ? Math.min(debtAfter, toRate(record.principal * debtAfter / debtBefore))
    : 0;
  const principalRepaid = record.principal - principalAfter;
  const carriedRepaid = Math.min(principalRepaid, record.carriedPrincipal);
  const next = {
    ...record,
    debt: debtAfter,
    principal: principalAfter,
    carriedPrincipal: Math.min(principalAfter, record.carriedPrincipal - carriedRepaid),
    borrowedAt: debtAfter > 0 ? record.borrowedAt : null,
    repaidTotal: record.repaidTotal + amount,
    repaidPrincipal: record.repaidPrincipal + principalRepaid,
    repaidCarriedPrincipal: record.repaidCarriedPrincipal + carriedRepaid,
    repayCount: record.repayCount + 1,
    recent: [{ type: 'repay', amount, debtAfter, at }, ...record.recent].slice(0, LOAN_RECENT_LIMIT),
    updatedAt: at
  };
  return { loan: next, debtBefore, debtAfter, repaidPrincipal: principalRepaid, repaidCarriedPrincipal: carriedRepaid };
}

/** 日付をまたいだときの利息。残っている借金を (1 + rate) 倍にし、いまの元本をすべて「またいだ元本」にする。借金が無ければ null */
export function applyInterest(loan, rate, at) {
  const record = normalizeLoanRecord(loan);
  if (record.debt <= 0) return null;
  const added = Math.max(0, toRate(record.debt * rate));
  const debtAfter = record.debt + added;
  const next = {
    ...record,
    debt: debtAfter,
    carriedPrincipal: record.principal,
    interestTotal: record.interestTotal + added,
    interestCount: record.interestCount + 1,
    recent: [{ type: 'interest', amount: added, debtAfter, at }, ...record.recent].slice(0, LOAN_RECENT_LIMIT),
    updatedAt: at
  };
  return { loan: next, debtBefore: record.debt, debtAfter, added };
}

/** 本人・公開ページに返す形 (内部の項目は含めない) */
export function publicLoanRecord(loan) {
  const record = normalizeLoanRecord(loan);
  return {
    player: record.player,
    debt: record.debt,
    principal: record.principal,
    carriedPrincipal: record.carriedPrincipal,
    borrowedAt: record.borrowedAt,
    repaidTotal: record.repaidTotal,
    repaidPrincipal: record.repaidPrincipal,
    repaidCarriedPrincipal: record.repaidCarriedPrincipal,
    interestTotal: record.interestTotal,
    loanCount: record.loanCount,
    repayCount: record.repayCount,
    interestCount: record.interestCount,
    recent: record.recent
  };
}
