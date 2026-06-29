// assets/js/trip-countdown.js

(function () {
    const countdown = document.getElementById('trip-countdown');
    if (!countdown) return;

    const valueElement = countdown.querySelector('[data-countdown-value]');
    if (!valueElement) return;

    const targetTime = new Date(countdown.dataset.target || '').getTime();
    let timerId = null;

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function formatRemaining(remainingMs) {
        if (remainingMs <= 0) return '旅行の時間です';

        const totalSeconds = Math.floor(remainingMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${days}日 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    function updateCountdown() {
        if (!Number.isFinite(targetTime)) {
            valueElement.textContent = '日時未設定';
            return;
        }

        const remainingMs = targetTime - Date.now();
        const text = formatRemaining(remainingMs);
        valueElement.textContent = text;
        countdown.setAttribute('aria-label', `旅行まであと ${text}`);

        if (remainingMs <= 0 && timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    updateCountdown();
    timerId = setInterval(updateCountdown, 1000);
}());
