// assets/js/rate-chart.js
// ホーム下部の「レートの推移」グラフ。
// Cloud Function が point_history (レート増減ログ) から組み立てた日別データ
// rate_chart/daily を1件読んで、その場で SVG を組み立てる。外部ライブラリは使わない。
// 横軸は1日 = 等幅の1区間。その日の変動 (対局・日次補正) を区間の中に1列ずつ並べる。

const RATE_CHART_CONTAINER = document.getElementById('rate-chart');

// 系列の色。羊皮紙 (#f1e3c4) の上で明度帯・彩度・色覚多様性での距離・
// コントラストを検証して通った並び順。色を足したり入れ替えたりしたら再検証すること。
const RATE_CHART_COLORS = [
    '#b0332a', // ラム酒の赤
    '#1f6f9c', // 海の青
    '#a9721a', // 真鍮
    '#7a4ea8', // 紫
    '#2f7d52', // 深緑
    '#c2557a', // 臙脂
    '#4d5fc4'  // 群青
];
const RATE_CHART_MAX_SERIES = RATE_CHART_COLORS.length;
const RATE_CHART_SVG_NS = 'http://www.w3.org/2000/svg';
const RATE_CHART_PAD = { top: 16, right: 68, bottom: 30, left: 48 };
const RATE_CHART_TICK_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
const RATE_CHART_SURFACE = '#f1e3c4';   // 羊皮紙 (マーカーの縁取り用)

let rateChartState = { days: [], points: [], series: [], hoverIndex: -1, loaded: false };
let rateChartLoadPromise = null;

function svgEl(name, attrs = {}) {
    const element = document.createElementNS(RATE_CHART_SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        element.setAttribute(key, String(value));
    });
    return element;
}

function rateChartDateLabel(dateKey) {
    const [, month, day] = String(dateKey).split('-');
    return `${Number(month)}/${Number(day)}`;
}

/** 目盛りが4〜6本になる刻み幅を選ぶ */
function rateChartTickStep(span) {
    const target = span / 5;
    return RATE_CHART_TICK_STEPS.find(step => step >= target) || RATE_CHART_TICK_STEPS[RATE_CHART_TICK_STEPS.length - 1];
}

function rateChartTimeLabel(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
}

/**
 * 日別データを「点」の列に展開する。x は日の番号 + その日の中での位置 (0〜1)。
 *   - 先頭の日だけ、区間の左端に始値の点を置く
 *   - その日の変動 n 件は区間を n 等分した右端に1件ずつ置く (最後の変動 = 区間の右端)
 *   - 変動が無い日は右端に終値の点を1つだけ置く (横ばい)
 */
function buildRateChartPoints(days) {
    const points = [];
    days.forEach((day, dayIndex) => {
        const events = Array.isArray(day.events) ? day.events.filter(event => event && event.rates) : [];
        if (dayIndex === 0) {
            points.push({ x: 0, dayIndex, date: day.date, label: '開始', rates: day.open || day.rates });
        }
        if (!events.length) {
            points.push({ x: dayIndex + 1, dayIndex, date: day.date, label: '変動なし', rates: day.rates });
            return;
        }
        events.forEach((event, eventIndex) => {
            const time = rateChartTimeLabel(event.at);
            points.push({
                x: dayIndex + (eventIndex + 1) / events.length,
                dayIndex,
                date: day.date,
                label: [time, event.reason].filter(Boolean).join(' '),
                rates: event.rates
            });
        });
    });
    return points;
}

/**
 * 点の列を系列 (プレイヤー1人 = 1本の線) に組み替える。
 * 人数が色数を超えたら、直近のレートが高い順に上位だけ描く。
 */
function buildRateChartSeries(points) {
    const names = [];
    points.forEach(point => {
        Object.keys(point.rates || {}).forEach(name => {
            if (!names.includes(name)) names.push(name);
        });
    });

    const lastRate = name => {
        for (let i = points.length - 1; i >= 0; i--) {
            const value = points[i].rates?.[name];
            if (Number.isFinite(value)) return value;
        }
        return null;
    };

    return names
        .map(name => ({
            name,
            last: lastRate(name),
            values: points.map(point => {
                const value = point.rates?.[name];
                return Number.isFinite(value) ? value : null;
            })
        }))
        .filter(series => series.values.some(value => value !== null))
        .sort((a, b) => (b.last ?? 0) - (a.last ?? 0))
        .slice(0, RATE_CHART_MAX_SERIES)
        .map((series, index) => ({ ...series, color: RATE_CHART_COLORS[index] }));
}

/** 値の範囲から、キリのいい目盛り位置と描画範囲を決める */
function buildRateChartScale(series, height) {
    const values = series.flatMap(item => item.values.filter(value => value !== null));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min === max) {
        min -= 50;
        max += 50;
    }

    const step = rateChartTickStep(max - min);
    // 全員が 0 以上なら軸も 0 で止める。マイナスの人がいればそこまで下げる
    const floor = Math.floor(min / step) * step;
    const niceMin = min >= 0 ? Math.max(0, floor) : floor;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = niceMin; value <= niceMax + 0.5; value += step) ticks.push(value);

    const plotTop = RATE_CHART_PAD.top;
    const plotHeight = height - RATE_CHART_PAD.top - RATE_CHART_PAD.bottom;
    return {
        min: niceMin,
        max: niceMax,
        ticks,
        y: value => plotTop + plotHeight * (1 - (value - niceMin) / (niceMax - niceMin))
    };
}

/** 直接ラベルが重ならないように、上から順に最低間隔をあけて並べ直す */
function spreadRateChartLabels(labels, top, bottom, minGap = 14) {
    const sorted = [...labels].sort((a, b) => a.y - b.y);
    let previous = -Infinity;
    sorted.forEach(label => {
        label.labelY = Math.max(label.y, previous + minGap);
        previous = label.labelY;
    });

    // 下にはみ出したぶんを上へ押し戻す
    let overflow = sorted.length ? sorted[sorted.length - 1].labelY - bottom : 0;
    if (overflow > 0) {
        for (let i = sorted.length - 1; i >= 0; i--) {
            sorted[i].labelY -= overflow;
            if (i > 0) {
                const gap = sorted[i].labelY - sorted[i - 1].labelY;
                if (gap >= minGap) break;
                overflow = minGap - gap;
            }
        }
    }
    sorted.forEach(label => {
        label.labelY = Math.min(Math.max(label.labelY, top), bottom);
    });
    return labels;
}

function renderRateChart() {
    if (!RATE_CHART_CONTAINER) return;
    const { days, points } = rateChartState;

    if (!days.length || !points.length) {
        RATE_CHART_CONTAINER.replaceChildren();
        const message = document.createElement('p');
        message.className = 'info-text';
        message.textContent = rateChartState.loaded
            ? 'まだレートの増減が記録されていません。'
            : 'レートの推移を読み込めませんでした。';
        RATE_CHART_CONTAINER.appendChild(message);
        return;
    }

    const series = rateChartState.series;
    const width = Math.max(280, RATE_CHART_CONTAINER.clientWidth || 320);
    const height = width >= 900 ? 320 : (width >= 640 ? 290 : 240);
    const scale = buildRateChartScale(series, height);
    if (!scale) return;

    const plotLeft = RATE_CHART_PAD.left;
    const plotRight = width - RATE_CHART_PAD.right;
    const plotBottom = height - RATE_CHART_PAD.bottom;
    const dayWidth = (plotRight - plotLeft) / days.length;
    const xAt = value => plotLeft + dayWidth * value;
    const x = index => xAt(points[index].x);

    const svg = svgEl('svg', {
        class: 'rate-chart-svg',
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        role: 'img',
        tabindex: '0',
        'aria-label': `直近${days.length}日のレート推移 (変動${points.length}件)。${series.map(item => item.name).join('、')}`
    });

    // --- 目盛り線と軸ラベル (背景側) ---
    scale.ticks.forEach(value => {
        const y = scale.y(value);
        svg.appendChild(svgEl('line', {
            class: 'rate-chart-grid',
            x1: plotLeft, x2: plotRight, y1: y, y2: y
        }));
        const label = svgEl('text', { class: 'rate-chart-axis-text', x: plotLeft - 8, y: y + 4, 'text-anchor': 'end' });
        label.textContent = value.toLocaleString('ja-JP');
        svg.appendChild(label);
    });

    // 基準レートの位置が分かるように1本だけ実線で引く
    if (typeof RATE_BASELINE_DEFAULT === 'number'
        && RATE_BASELINE_DEFAULT >= scale.min && RATE_BASELINE_DEFAULT <= scale.max) {
        const y = scale.y(RATE_BASELINE_DEFAULT);
        svg.appendChild(svgEl('line', { class: 'rate-chart-baseline', x1: plotLeft, x2: plotRight, y1: y, y2: y }));
        const label = svgEl('text', { class: 'rate-chart-baseline-text', x: plotLeft + 4, y: y - 5 });
        label.textContent = `基準 ${RATE_BASELINE_DEFAULT.toLocaleString('ja-JP')}`;
        svg.appendChild(label);
    }

    // --- 日の区切り線と日付ラベル (区間の中央。狭いときは間引く、最新日は必ず出す) ---
    for (let i = 0; i <= days.length; i++) {
        svg.appendChild(svgEl('line', {
            class: 'rate-chart-day-divider',
            x1: xAt(i), x2: xAt(i), y1: RATE_CHART_PAD.top, y2: plotBottom
        }));
    }
    const labelEvery = Math.max(1, Math.ceil(36 / dayWidth));
    days.forEach((day, index) => {
        if ((days.length - 1 - index) % labelEvery !== 0) return;
        const label = svgEl('text', {
            class: 'rate-chart-axis-text',
            x: xAt(index + 0.5), y: plotBottom + 18, 'text-anchor': 'middle'
        });
        label.textContent = rateChartDateLabel(day.date);
        svg.appendChild(label);
    });

    // --- 折れ線 ---
    series.forEach(item => {
        let path = '';
        item.values.forEach((value, index) => {
            if (value === null) return;
            path += `${path ? 'L' : 'M'}${x(index).toFixed(1)} ${scale.y(value).toFixed(1)}`;
        });
        if (!path) return;
        svg.appendChild(svgEl('path', { class: 'rate-chart-line', d: path, stroke: item.color }));
    });

    // --- 線の終端の点と名前 (凡例だけに頼らず、線そのものに名前を添える) ---
    const endLabels = series
        .map(item => {
            const index = item.values.reduce((last, value, i) => (value === null ? last : i), -1);
            if (index < 0) return null;
            return { item, index, y: scale.y(item.values[index]) };
        })
        .filter(Boolean);
    spreadRateChartLabels(endLabels, RATE_CHART_PAD.top + 4, plotBottom);

    endLabels.forEach(label => {
        const pointX = x(label.index);
        const labelX = plotRight + 10;
        if (Math.abs(label.labelY - label.y) > 2) {
            // ずらしたぶんは引き出し線でつなぐ
            svg.appendChild(svgEl('path', {
                class: 'rate-chart-leader',
                d: `M${pointX + 5} ${label.y}L${labelX - 4} ${label.labelY}`
            }));
        }
        svg.appendChild(svgEl('circle', {
            class: 'rate-chart-end-dot', cx: pointX, cy: label.y, r: 4, fill: label.item.color
        }));
        const text = svgEl('text', { class: 'rate-chart-end-text', x: labelX, y: label.labelY + 4 });
        text.textContent = label.item.name;
        svg.appendChild(text);
    });

    // --- ホバー/フォーカス用のレイヤー ---
    const crosshair = svgEl('line', {
        class: 'rate-chart-crosshair', x1: 0, x2: 0, y1: RATE_CHART_PAD.top, y2: plotBottom, visibility: 'hidden'
    });
    svg.appendChild(crosshair);
    const hoverDots = svgEl('g', { class: 'rate-chart-hover-dots', visibility: 'hidden' });
    series.forEach(item => {
        hoverDots.appendChild(svgEl('circle', { r: 4.5, fill: item.color, stroke: RATE_CHART_SURFACE, 'stroke-width': 2 }));
    });
    svg.appendChild(hoverDots);

    const figure = document.createElement('div');
    figure.className = 'rate-chart-figure';
    figure.appendChild(svg);

    const tooltip = document.createElement('div');
    tooltip.className = 'rate-chart-tooltip';
    tooltip.hidden = true;
    figure.appendChild(tooltip);

    RATE_CHART_CONTAINER.replaceChildren();
    RATE_CHART_CONTAINER.appendChild(figure);
    RATE_CHART_CONTAINER.appendChild(buildRateChartLegend(series));

    attachRateChartHover({ svg, figure, tooltip, crosshair, hoverDots, series, points, scale, x, plotLeft, plotRight });
}

/** 系列が2本以上あるときは凡例を必ず出す (色だけに意味を持たせない) */
function buildRateChartLegend(series) {
    const legend = document.createElement('ul');
    legend.className = 'rate-chart-legend';
    series.forEach(item => {
        const row = document.createElement('li');
        const key = document.createElement('span');
        key.className = 'rate-chart-legend-key';
        key.style.backgroundColor = item.color;
        const name = document.createElement('span');
        name.textContent = item.name;
        const value = document.createElement('span');
        value.className = 'rate-chart-legend-value';
        value.textContent = Number.isFinite(item.last) ? item.last.toLocaleString('ja-JP') : '—';
        row.append(key, name, value);
        legend.appendChild(row);
    });
    return legend;
}

/**
 * 縦線 + ツールチップ。線の上を狙わなくても、その変動の直後の全員の数値が出る。
 * マウス・タッチ・キーボード (←→) のどれでも同じ内容を出す。
 */
function attachRateChartHover(context) {
    const { svg, figure, tooltip, crosshair, hoverDots, series, points, scale, x, plotLeft, plotRight } = context;

    const hide = () => {
        crosshair.setAttribute('visibility', 'hidden');
        hoverDots.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
        rateChartState.hoverIndex = -1;
    };

    const show = index => {
        const clamped = Math.min(points.length - 1, Math.max(0, index));
        rateChartState.hoverIndex = clamped;
        const pointX = x(clamped);

        crosshair.setAttribute('x1', pointX);
        crosshair.setAttribute('x2', pointX);
        crosshair.setAttribute('visibility', 'visible');

        series.forEach((item, seriesIndex) => {
            const dot = hoverDots.children[seriesIndex];
            const value = item.values[clamped];
            if (value === null) {
                dot.setAttribute('visibility', 'hidden');
                return;
            }
            dot.setAttribute('visibility', 'visible');
            dot.setAttribute('cx', pointX);
            dot.setAttribute('cy', scale.y(value));
        });
        hoverDots.setAttribute('visibility', 'visible');

        tooltip.replaceChildren();
        const dateRow = document.createElement('p');
        dateRow.className = 'rate-chart-tooltip-date';
        dateRow.textContent = rateChartDateLabel(points[clamped].date);
        tooltip.appendChild(dateRow);
        if (points[clamped].label) {
            const eventRow = document.createElement('p');
            eventRow.className = 'rate-chart-tooltip-event';
            eventRow.textContent = points[clamped].label;
            tooltip.appendChild(eventRow);
        }

        series.forEach(item => {
            const value = item.values[clamped];
            const row = document.createElement('p');
            row.className = 'rate-chart-tooltip-row';
            const key = document.createElement('span');
            key.className = 'rate-chart-tooltip-key';
            key.style.backgroundColor = item.color;
            const amount = document.createElement('strong');
            amount.textContent = value === null ? '—' : value.toLocaleString('ja-JP');
            const name = document.createElement('span');
            name.className = 'rate-chart-tooltip-name';
            name.textContent = item.name;
            row.append(key, amount, name);
            tooltip.appendChild(row);
        });

        tooltip.hidden = false;
        const half = tooltip.offsetWidth / 2;
        const left = Math.min(Math.max(pointX, plotLeft + half), plotRight + RATE_CHART_PAD.right - half);
        tooltip.style.left = `${left}px`;
    };

    const indexFromEvent = event => {
        const rect = svg.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const position = ratio * svg.viewBox.baseVal.width;
        // 一番近い変動の点を選ぶ
        let nearest = 0;
        points.forEach((point, index) => {
            if (Math.abs(x(index) - position) < Math.abs(x(nearest) - position)) nearest = index;
        });
        return nearest;
    };

    svg.addEventListener('pointermove', event => show(indexFromEvent(event)));
    svg.addEventListener('pointerdown', event => show(indexFromEvent(event)));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointercancel', hide);   // スクロールに取られたとき
    svg.addEventListener('blur', hide);
    svg.addEventListener('focus', () => show(rateChartState.hoverIndex < 0 ? points.length - 1 : rateChartState.hoverIndex));
    svg.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const base = rateChartState.hoverIndex < 0 ? points.length - 1 : rateChartState.hoverIndex;
            show(base + (event.key === 'ArrowLeft' ? -1 : 1));
        } else if (event.key === 'Escape') {
            hide();
        }
    });
    figure.addEventListener('pointerleave', hide);
}

let rateChartHealAttempted = false;

/**
 * グラフ用データがまだ1件も無いときに、ログイン済みなら1度だけ組み立てを頼む。
 * (初回導入直後など。無限に叩かないようページごとに1回だけ)
 */
async function healRateChartIfEmpty() {
    await rateChartLoadPromise;
    if (rateChartHealAttempted || rateChartState.days.length) return;
    if (typeof getCurrentFirebaseUidSync !== 'function' || !getCurrentFirebaseUidSync()) return;
    rateChartHealAttempted = true;
    await requestRateChartRebuild();
    rateChartLoadPromise = loadRateChart();
    await rateChartLoadPromise;
}

async function loadRateChart() {
    if (!RATE_CHART_CONTAINER) return;
    try {
        const chart = typeof fetchRateChart === 'function' ? await fetchRateChart() : null;
        const days = chart?.days || [];
        const points = buildRateChartPoints(days);
        rateChartState = {
            days,
            points,
            series: buildRateChartSeries(points),
            hoverIndex: -1,
            loaded: true
        };
    } catch (error) {
        console.error('レート推移の取得に失敗しました:', error);
        rateChartState = { days: [], points: [], series: [], hoverIndex: -1, loaded: true };
    }
    renderRateChart();
}

// 幅が変わったら描き直す (フォントサイズを保つため viewBox は固定せず実寸で描いている)
let rateChartResizeTimer = null;
let rateChartLastWidth = RATE_CHART_CONTAINER?.clientWidth || 0;
window.addEventListener('resize', () => {
    if (!RATE_CHART_CONTAINER) return;
    window.clearTimeout(rateChartResizeTimer);
    rateChartResizeTimer = window.setTimeout(() => {
        const width = RATE_CHART_CONTAINER.clientWidth;
        if (width && Math.abs(width - rateChartLastWidth) > 8) {
            rateChartLastWidth = width;
            renderRateChart();
        }
    }, 200);
});

window.qjongRateChart = {
    load: () => (rateChartLoadPromise = loadRateChart()),
    render: renderRateChart,
    healIfEmpty: healRateChartIfEmpty
};

rateChartLoadPromise = loadRateChart();
