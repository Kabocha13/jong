// assets/js/header-clock.js

(function () {
    const clock = document.getElementById('header-clock');
    if (!clock) return;

    const timeElement = clock.querySelector('[data-clock-time]');
    const dateElement = clock.querySelector('[data-clock-date]');
    if (!timeElement || !dateElement) return;

    const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function updateClock() {
        const now = new Date();
        const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const date = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 (${WEEKDAYS[now.getDay()]})`;

        timeElement.textContent = time;
        dateElement.textContent = date;
        clock.setAttribute('aria-label', `現在時刻 ${date} ${time}`);
    }

    updateClock();
    setInterval(updateClock, 1000);
}());
