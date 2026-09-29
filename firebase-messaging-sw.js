// firebase-messaging-sw.js
// FCMバックグラウンド通知の受信専用Service Worker。
// fetchハンドラを持たないため、ページのキャッシュ・オフライン動作には一切関与しない。

self.window = self; // firebase-config.js が window へ代入するための互換措置

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
importScripts('/assets/js/firebase-config.js');

// fetch ハンドラが無いので、新しい版はすぐ有効にしてよい
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Firebase SDK は、このサイトのページが画面に見えている間に届いた通知を表示せず、ページへ渡すだけにする。
// 画面側で受け取って出す処理は無いので、そのままだと管理画面やホームを開いている端末には何も出ない
// (くじを作った本人の端末など)。見えているページがあるときはここで表示する。
// 見えていないときは SDK が表示するので二重には出ない (同じ tag なので重なっても1つにまとまる)
const QJONG_NOTIFICATION_ICON = '/assets/icon.png';

self.addEventListener('push', event => {
    let payload = null;
    try {
        payload = event.data ? event.data.json() : null;
    } catch (error) {
        return;
    }
    const notification = payload && payload.notification;
    if (!notification || !notification.title) return;

    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        if (!clients.some(client => client.visibilityState === 'visible')) return undefined;
        return self.registration.showNotification(notification.title, {
            body: notification.body || '',
            icon: notification.icon || QJONG_NOTIFICATION_ICON,
            tag: notification.tag,
            data: { qjongLink: (payload.fcmOptions && payload.fcmOptions.link) || '/' }
        });
    }));
});

// 上で出した通知を押したときは、その画面を開く (SDK が出した通知は SDK が開く)
self.addEventListener('notificationclick', event => {
    const link = event.notification.data && event.notification.data.qjongLink;
    if (!link) return;
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const opened = clients.find(client => client.url === link);
        return opened ? opened.focus() : self.clients.openWindow(link);
    }));
});

firebase.initializeApp(self.QJONG_FIREBASE_CONFIG);

// notificationペイロード付きメッセージは、ページが見えていなければSDKが自動表示し、
// クリック時は webpush.fcmOptions.link (ホーム画面) へ遷移する。
firebase.messaging();
