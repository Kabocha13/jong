// firebase-messaging-sw.js
// FCMバックグラウンド通知の受信専用Service Worker。
// fetchハンドラを持たないため、ページのキャッシュ・オフライン動作には一切関与しない。

self.window = self; // firebase-config.js が window へ代入するための互換措置

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
importScripts('/assets/js/firebase-config.js');

firebase.initializeApp(self.QJONG_FIREBASE_CONFIG);

// notificationペイロード付きメッセージはSDKが自動表示し、
// クリック時は webpush.fcmOptions.link (ホーム画面) へ遷移する。
firebase.messaging();
