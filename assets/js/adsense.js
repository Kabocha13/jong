// assets/js/adsense.js

(function () {
    const SCRIPT_ID = 'qjong-adsense-script';
    const PUBLISHER_ID_PATTERN = /^ca-pub-\d{12,}$/;
    const SLOT_ID_PATTERN = /^\d+$/;
    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

    const adContainers = [];
    let isScriptRequested = false;
    let isScriptLoaded = false;

    function getConfig() {
        const rawConfig = window.QJONG_ADSENSE_CONFIG || {};
        return {
            enabled: rawConfig.enabled !== false,
            publisherId: String(rawConfig.publisherId || rawConfig.client || '').trim(),
            testMode: Boolean(rawConfig.testMode),
            slots: rawConfig.slots || {}
        };
    }

    function isLocalPreview() {
        return window.location.protocol === 'file:' || LOCAL_HOSTS.has(window.location.hostname);
    }

    function hideContainer(container) {
        container.hidden = true;
        container.setAttribute('data-ad-state', 'disabled');
    }

    function loadAdSenseScript(config) {
        if (isScriptLoaded) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const existingAdSenseScript = document.querySelector(`script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"][src*="client=${config.publisherId}"]`);
            if (existingAdSenseScript) {
                isScriptRequested = true;
                isScriptLoaded = true;
                resolve();
                return;
            }

            const existingScript = document.getElementById(SCRIPT_ID);
            if (existingScript) {
                if (isScriptLoaded) {
                    resolve();
                    return;
                }
                existingScript.addEventListener('load', () => resolve(), { once: true });
                existingScript.addEventListener('error', reject, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.publisherId)}`;
            script.addEventListener('load', () => {
                isScriptLoaded = true;
                resolve();
            }, { once: true });
            script.addEventListener('error', reject, { once: true });

            isScriptRequested = true;
            document.head.appendChild(script);
        });
    }

    function createAdElement(config, slotId) {
        const adElement = document.createElement('ins');
        adElement.className = 'adsbygoogle';
        adElement.style.display = 'block';
        adElement.dataset.adClient = config.publisherId;
        adElement.dataset.adSlot = slotId;
        adElement.dataset.adFormat = 'auto';
        adElement.dataset.fullWidthResponsive = 'true';

        if (config.testMode) {
            adElement.dataset.adtest = 'on';
        }

        return adElement;
    }

    async function renderAd(container, config) {
        if (container.dataset.adState === 'rendered') return;

        const slotKey = container.dataset.adSlotKey;
        const slotId = String(config.slots[slotKey] || '').trim();
        if (!SLOT_ID_PATTERN.test(slotId)) {
            hideContainer(container);
            return;
        }

        container.hidden = false;
        container.dataset.adState = 'loading';
        container.replaceChildren(createAdElement(config, slotId));

        try {
            if (!isScriptRequested) await loadAdSenseScript(config);
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            container.dataset.adState = 'rendered';
        } catch (error) {
            console.warn('AdSense failed to load.', error);
            hideContainer(container);
        }
    }

    function renderVisibleAds(config) {
        if (!('IntersectionObserver' in window)) {
            adContainers.forEach(container => renderAd(container, config));
            return;
        }

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                renderAd(entry.target, config);
            });
        }, { rootMargin: '240px 0px' });

        adContainers.forEach(container => observer.observe(container));
    }

    function initAdSense() {
        const config = getConfig();
        adContainers.push(...document.querySelectorAll('[data-ad-slot-key]'));

        if (
            !config.enabled ||
            !PUBLISHER_ID_PATTERN.test(config.publisherId) ||
            (isLocalPreview() && !config.testMode)
        ) {
            adContainers.forEach(hideContainer);
            return;
        }

        renderVisibleAds(config);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdSense, { once: true });
    } else {
        initAdSense();
    }
}());
